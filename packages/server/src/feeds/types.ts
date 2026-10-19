import type { AircraftState, BBox } from '@contrail/shared';

/** A single aircraft report as produced by a feed adapter, before merging. */
export type FeedAircraft = Pick<AircraftState, 'hex' | 'lat' | 'lon' | 'ts' | 'source' | 'onGround'> &
  Partial<Pick<AircraftState, 'callsign' | 'reg' | 'type' | 'desc' | 'altBaro' | 'altGeom' | 'gs' | 'tas' | 'track' | 'heading' | 'vr' | 'squawk' | 'emergency' | 'emitter' | 'military' | 'rssi' | 'seen' | 'seenPos' | 'origin' | 'dest'>>;

export interface FeedPollResult {
  /** Feed receive timestamp (ms). */
  ts: number;
  aircraft: FeedAircraft[];
  /** Area the result covers; undefined = global. Used so stale aircraft outside polled areas are not expired prematurely. */
  coverage?: BBox[] | 'global';
}

export interface FeedStatus {
  name: string;
  healthy: boolean;
  lastSuccess?: number;
  lastError?: string;
  aircraft: number;
  requests: number;
  intervalMs: number;
}

/** A circle of interest the adapter should poll (e.g. a client viewport). */
export interface InterestArea {
  lat: number;
  lon: number;
  radiusNm: number;
  /** Higher = polled first. */
  priority: number;
}

export interface FeedAdapter {
  readonly name: string;
  readonly intervalMs: number;
  /** Called once before polling starts. */
  init?(): Promise<void>;
  poll(interest: InterestArea[]): Promise<FeedPollResult>;
  status(): FeedStatus;
}
