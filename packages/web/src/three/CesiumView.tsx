import { useEffect, useRef, useState } from 'react';
import type * as CesiumNs from 'cesium';
import { aircraftTypeInfo, altitudeColor, headingDelta, type AircraftState } from '@contrail/shared';
import { interpolate, useAircraft, type LiveAircraft } from '@/state/aircraft';
import 'cesium/Build/Cesium/Widgets/widgets.css';

export type CameraMode = 'cockpit' | 'chase' | 'wing' | 'orbit' | 'free';

export interface CesiumViewProps {
  hex: string;
  mode: CameraMode;
  onStatus?: (s: { terrain: boolean; buildings: boolean; error?: string }) => void;
}

declare global { interface Window { CESIUM_BASE_URL?: string } }

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;

/** Attitude estimate from live data: pitch from vertical rate, roll from turn rate (coordinated turn). */
export function attitude(a: AircraftState, turnRateDegS: number | undefined): { pitch: number; roll: number } {
  const gsMs = Math.max(1, (a.gs ?? 0) * KT_TO_MS);
  const vrMs = ((a.vr ?? 0) * FT_TO_M) / 60;
  const pitch = Math.max(-15, Math.min(15, (Math.atan2(vrMs, gsMs) * 180) / Math.PI));
  const tr = turnRateDegS ?? 0;
  const roll = Math.max(-30, Math.min(30, (Math.atan(((tr * Math.PI) / 180) * gsMs / 9.81) * 180) / Math.PI));
  return { pitch: (pitch * Math.PI) / 180, roll: (roll * Math.PI) / 180 };
}

/**
 * CesiumJS globe showing the selected aircraft as a glTF model oriented from live data,
 * nearby traffic, the flight trail and real-time sun lighting. Camera follows the chosen mode.
 */
export function CesiumView({ hex, mode, onStatus }: CesiumViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const modeRef = useRef<CameraMode>(mode);
  const [error, setError] = useState<string | null>(null);
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  const modeChanged = useRef(true);
  useEffect(() => { modeRef.current = mode; modeChanged.current = true; }, [mode]);

  useEffect(() => {
    let disposed = false;
    let viewer: CesiumNs.Viewer | undefined;
    let removeTick: (() => void) | undefined;
    const el = container.current;
    if (!el) return;

    (async () => {
      window.CESIUM_BASE_URL = CESIUM_BASE_URL;
      const Cesium = await import('cesium');
      if (disposed) return;
      const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
      if (token) Cesium.Ion.defaultAccessToken = token;

      const credits = document.createElement('div');
      credits.style.display = 'none';
      el.appendChild(credits);

      let baseLayer: CesiumNs.ImageryLayer | false = false;
      if (!token) {
        try {
          baseLayer = new Cesium.ImageryLayer(new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' }));
        } catch { baseLayer = false; }
      }
      try {
        viewer = new Cesium.Viewer(el, {
          animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
          navigationHelpButton: false, infoBox: false, selectionIndicator: false, fullscreenButton: false, creditContainer: credits,
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          ...(token ? {} : { baseLayer }),
          requestRenderMode: false,
        });
      } catch (err) {
        setError(`3D view unavailable: ${(err as Error).message}`);
        statusRef.current?.({ terrain: false, buildings: false, error: (err as Error).message });
        return;
      }
      const v = viewer;
      const scene = v.scene;
      scene.globe.enableLighting = true;
      scene.light = new Cesium.SunLight();
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
      scene.fog.enabled = true;
      scene.globe.baseColor = Cesium.Color.fromCssColorString('#1b2a3a');
      v.clock.currentTime = Cesium.JulianDate.now();
      v.clock.shouldAnimate = true;
      v.clock.clockStep = Cesium.ClockStep.SYSTEM_CLOCK;
      scene.screenSpaceCameraController.enableCollisionDetection = false;

      let terrain = false, buildings = false;
      if (token) {
        try { v.terrainProvider = await Cesium.createWorldTerrainAsync(); terrain = true; } catch { /* keep ellipsoid */ }
        try { scene.primitives.add(await Cesium.createOsmBuildingsAsync()); buildings = true; } catch { /* no buildings */ }
      }
      if (disposed) return;
      statusRef.current?.({ terrain, buildings });

      // --- state helpers
      const store = useAircraft;
      const entryOf = (): LiveAircraft | undefined => store.getState().aircraft.get(hex);
      let lastTrack: { track: number; t: number } | undefined;
      let turnRate: number | undefined;
      let lastP1: [number, number, number, number] | undefined;
      const cart = new Cesium.Cartesian3();
      let spanM = 36;

      const currentPosition = (result?: CesiumNs.Cartesian3): CesiumNs.Cartesian3 | undefined => {
        const e = entryOf();
        if (!e) return undefined;
        const [lat, lon, , altFt] = interpolate(e, performance.now());
        const alt = e.state.onGround ? 0 : Math.max(0, altFt * FT_TO_M);
        return Cesium.Cartesian3.fromDegrees(lon, lat, alt, Cesium.Ellipsoid.WGS84, result ?? cart);
      };
      const currentHpr = (): { heading: number; pitch: number; roll: number } => {
        const e = entryOf();
        if (!e) return { heading: 0, pitch: 0, roll: 0 };
        const [, , track] = interpolate(e, performance.now());
        if (e.p1 !== lastP1) {
          // new push: derive turn rate from consecutive track endpoints
          const now = performance.now();
          if (lastTrack && now - lastTrack.t > 500) turnRate = headingDelta(lastTrack.track, e.p1[2]) / ((now - lastTrack.t) / 1000);
          lastTrack = { track: e.p1[2], t: now };
          lastP1 = e.p1;
          spanM = aircraftTypeInfo(e.state.type)?.spanM ?? 36;
        }
        const att = attitude(e.state, e.state.turnRate ?? turnRate);
        return { heading: Cesium.Math.toRadians(track), pitch: att.pitch, roll: att.roll };
      };

      // --- selected aircraft model (Model primitive so we can declare the glb's X-forward / Z-up axes)
      const initialSpan = aircraftTypeInfo(entryOf()?.state.type)?.spanM ?? 36;
      spanM = initialSpan;
      let model: CesiumNs.Model | undefined;
      const hprScratch = new Cesium.HeadingPitchRoll();
      const modelMatrix = new Cesium.Matrix4();
      const scaleScratch = new Cesium.Cartesian3();
      const updateModelMatrix = () => {
        if (!model) return;
        const p = currentPosition(new Cesium.Cartesian3());
        if (!p) { model.show = false; return; }
        model.show = true;
        const { heading, pitch, roll } = currentHpr();
        // Cesium's heading is measured from local east; aviation heading from north.
        hprScratch.heading = heading - Math.PI / 2; hprScratch.pitch = pitch; hprScratch.roll = roll;
        Cesium.Transforms.headingPitchRollToFixedFrame(p, hprScratch, Cesium.Ellipsoid.WGS84, undefined, modelMatrix);
        const sc = spanM / 36;
        Cesium.Matrix4.multiplyByScale(modelMatrix, Cesium.Cartesian3.fromElements(sc, sc, sc, scaleScratch), modelMatrix);
        model.modelMatrix = modelMatrix;
      };
      try {
        model = await Cesium.Model.fromGltfAsync({ url: '/models/aircraft.glb', upAxis: Cesium.Axis.Z, forwardAxis: Cesium.Axis.X, minimumPixelSize: 48, maximumScale: 200, modelMatrix: Cesium.Matrix4.IDENTITY.clone() });
        if (disposed) { model.destroy(); return; }
        scene.primitives.add(model);
        updateModelMatrix();
      } catch (err) {
        console.warn('aircraft model failed to load', err);
      }

      // --- trail
      v.entities.add({
        id: 'trail',
        polyline: {
          positions: new Cesium.CallbackProperty(() => {
            const st = store.getState();
            const e = entryOf();
            // The server trail can be ahead of the interpolated head (we lag one push); clip it to the estimated position time.
            let cutoff = Number.POSITIVE_INFINITY;
            if (e) {
              const f = e.t1 <= e.t0 ? 1 : Math.max(0, Math.min(1, (performance.now() - e.t0) / (e.t1 - e.t0)));
              cutoff = e.state.ts - (1 - f) * st.pushIntervalMs - 500;
            }
            const pts = st.selectedTrail.filter((p) => p.ts <= cutoff);
            const out = pts.map((p) => Cesium.Cartesian3.fromDegrees(p.lon, p.lat, Math.max(0, (p.alt ?? 0) * FT_TO_M)));
            const head = currentPosition(new Cesium.Cartesian3());
            if (head) out.push(head);
            return out;
          }, false),
          width: 3,
          material: new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(() => {
            const pts = store.getState().selectedTrail;
            const [r, g, b] = altitudeColor(pts.length ? pts[pts.length - 1].alt : entryOf()?.state.altBaro);
            return Cesium.Color.fromBytes(r, g, b, 220);
          }, false)),
          arcType: Cesium.ArcType.NONE,
        },
      });

      // --- nearby traffic
      const traffic = new Map<string, CesiumNs.Entity>();
      const syncTraffic = () => {
        const st = store.getState();
        const seen = new Set<string>();
        for (const [h, e] of st.aircraft) {
          if (h === hex) continue;
          seen.add(h);
          if (traffic.has(h)) continue;
          const ent = v.entities.add({
            id: `tr-${h}`,
            position: new Cesium.CallbackPositionProperty((_t, result) => {
              const x = st.aircraft.get(h) ?? store.getState().aircraft.get(h);
              if (!x) return undefined;
              const [lat, lon, , altFt] = interpolate(x, performance.now());
              return Cesium.Cartesian3.fromDegrees(lon, lat, x.state.onGround ? 0 : Math.max(0, altFt * FT_TO_M), Cesium.Ellipsoid.WGS84, result);
            }, false) as unknown as CesiumNs.PositionProperty,
            point: { pixelSize: 7, color: e.state.onGround ? Cesium.Color.fromCssColorString('#8fa3bf') : Cesium.Color.fromCssColorString('#f5c542'), outlineColor: Cesium.Color.fromCssColorString('#0b1220'), outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            label: { text: e.state.callsign ?? e.state.reg ?? '', font: '600 11px Inter, sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.fromCssColorString('#0b1220'), outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(10, -10), horizontalOrigin: Cesium.HorizontalOrigin.LEFT, scaleByDistance: new Cesium.NearFarScalar(2000, 1, 150000, 0.6), translucencyByDistance: new Cesium.NearFarScalar(50000, 1, 400000, 0), disableDepthTestDistance: Number.POSITIVE_INFINITY },
          });
          traffic.set(h, ent);
        }
        for (const [h, ent] of traffic) if (!seen.has(h)) { v.entities.remove(ent); traffic.delete(h); }
      };
      syncTraffic();
      const unsub = store.subscribe((s, prev) => { if (s.version !== prev.version) syncTraffic(); });

      // --- camera
      let orbitAngle = 0;
      let orbitRange = 200;
      let orbitZoomed = false;
      const onZoomGesture = (ev: Event) => { if (!(ev instanceof TouchEvent) || ev.touches.length > 1) orbitZoomed = true; };
      el.addEventListener('wheel', onZoomGesture, { passive: true });
      el.addEventListener('touchmove', onZoomGesture, { passive: true });
      let initialised = false;
      const enu = new Cesium.Matrix4();
      void orbitAngle;
      const scratchOffset = new Cesium.Cartesian3();
      const applyCamera = () => {
        const p = currentPosition(new Cesium.Cartesian3());
        if (!p) return;
        const { heading, pitch, roll } = currentHpr();
        const cam = v.camera;
        const m = modeRef.current;
        const dist = Math.max(60, spanM * 4);
        if (modeChanged.current) {
          modeChanged.current = false;
          cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
          if (m === 'orbit') {
            orbitRange = Math.max(100, spanM * 6);
            cam.lookAt(p, new Cesium.HeadingPitchRange(heading + Math.PI / 4, Cesium.Math.toRadians(-20), orbitRange));
          } else if (m === 'free') {
            cam.lookAt(p, new Cesium.HeadingPitchRange(heading, Cesium.Math.toRadians(-25), Math.max(300, spanM * 10)));
            cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
          }
        }
        switch (m) {
          case 'chase':
            cam.lookAt(p, new Cesium.HeadingPitchRange(heading, Cesium.Math.toRadians(-12) + pitch * 0.5, dist));
            break;
          case 'wing':
            cam.lookAt(p, new Cesium.HeadingPitchRange(heading + Math.PI / 2, Cesium.Math.toRadians(-8), Math.max(60, spanM * 2.2)));
            break;
          case 'cockpit': {
            // nose position: 18 m forward in the local east-north-up frame, 2 m up
            Cesium.Transforms.eastNorthUpToFixedFrame(p, Cesium.Ellipsoid.WGS84, enu);
            const fwd = Math.max(12, spanM * 0.6 + 3);
            Cesium.Cartesian3.fromElements(Math.sin(heading) * fwd, Math.cos(heading) * fwd, 3, scratchOffset);
            const nose = Cesium.Matrix4.multiplyByPoint(enu, scratchOffset, new Cesium.Cartesian3());
            cam.lookAtTransform(Cesium.Matrix4.IDENTITY);
            cam.setView({ destination: nose, orientation: { heading, pitch, roll } });
            break;
          }
          case 'orbit': {
            // keep the user's current offset (they may have dragged), advance the heading slowly, re-centre on the aircraft
            // adopt a new distance only after the user zoomed (wheel / pinch); otherwise hold the range
            if (orbitZoomed) { orbitRange = Math.max(30, Cesium.Cartesian3.distance(cam.positionWC, p)); orbitZoomed = false; }
            orbitAngle = cam.heading + 0.0025;
            cam.lookAt(p, new Cesium.HeadingPitchRange(orbitAngle, Math.min(-0.05, cam.pitch), orbitRange));
            break;
          }
          case 'free':
          default:
            break;
        }
        initialised = true;
      };

      // viewport subscription for the live feed around the aircraft
      let lastViewCenter: [number, number] | undefined;
      const { live } = await import('@/lib/ws');
      const updateView = () => {
        const e = entryOf();
        if (!e) return;
        const [lat, lon] = interpolate(e, performance.now());
        if (lastViewCenter && Math.abs(lastViewCenter[0] - lat) < 1 && Math.abs(lastViewCenter[1] - lon) < 1) return;
        lastViewCenter = [lat, lon];
        live.setView([lon - 3, lat - 3, lon + 3, lat + 3], 8);
      };

      const onTick = () => {
        if (disposed) return;
        updateView();
        updateModelMatrix();
        applyCamera();
      };
      removeTick = v.clock.onTick.addEventListener(onTick);
      void initialised;
      const origRemove = removeTick;
      removeTick = () => { origRemove(); unsub(); el.removeEventListener('wheel', onZoomGesture); el.removeEventListener('touchmove', onZoomGesture); };
    })().catch((err: Error) => {
      if (!disposed) { setError(`3D view failed to start: ${err.message}`); statusRef.current?.({ terrain: false, buildings: false, error: err.message }); }
    });

    return () => {
      disposed = true;
      removeTick?.();
      try { viewer?.destroy(); } catch { /* ignore */ }
      el.replaceChildren();
    };
  }, [hex]);

  return (
    <div className="absolute inset-0 bg-ink">
      <div ref={container} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      {error && <div className="absolute inset-0 flex items-center justify-center p-6"><div className="panel p-4 text-sm text-red-200 max-w-md">{error}</div></div>}
    </div>
  );
}
