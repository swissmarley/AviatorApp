export interface Airline {
  icao: string;
  iata?: string;
  name: string;
  /** Primarily a cargo operator. */
  cargo?: boolean;
  /** Brand colour used for generated logos. */
  color?: string;
  country?: string;
}

/**
 * Compact airline table keyed by ICAO code. Covers the operators most often seen on
 * public ADS-B feeds; unknown callsign prefixes fall back to a generated badge.
 */
export const AIRLINES: Airline[] = [
  { icao: 'AAL', iata: 'AA', name: 'American Airlines', color: '#0078D2', country: 'US' },
  { icao: 'DAL', iata: 'DL', name: 'Delta Air Lines', color: '#C01933', country: 'US' },
  { icao: 'UAL', iata: 'UA', name: 'United Airlines', color: '#002244', country: 'US' },
  { icao: 'SWA', iata: 'WN', name: 'Southwest Airlines', color: '#304CB2', country: 'US' },
  { icao: 'JBU', iata: 'B6', name: 'JetBlue Airways', color: '#003876', country: 'US' },
  { icao: 'ASA', iata: 'AS', name: 'Alaska Airlines', color: '#01426A', country: 'US' },
  { icao: 'NKS', iata: 'NK', name: 'Spirit Airlines', color: '#FFE600', country: 'US' },
  { icao: 'FFT', iata: 'F9', name: 'Frontier Airlines', color: '#248168', country: 'US' },
  { icao: 'AAY', iata: 'G4', name: 'Allegiant Air', color: '#F5A623', country: 'US' },
  { icao: 'HAL', iata: 'HA', name: 'Hawaiian Airlines', color: '#5A2A82', country: 'US' },
  { icao: 'SKW', iata: 'OO', name: 'SkyWest Airlines', color: '#1F4E79', country: 'US' },
  { icao: 'RPA', iata: 'YX', name: 'Republic Airways', color: '#1A3F6B', country: 'US' },
  { icao: 'ENY', iata: 'MQ', name: 'Envoy Air', color: '#0078D2', country: 'US' },
  { icao: 'EDV', iata: '9E', name: 'Endeavor Air', color: '#C01933', country: 'US' },
  { icao: 'PDT', iata: 'PT', name: 'Piedmont Airlines', color: '#0078D2', country: 'US' },
  { icao: 'PSA', iata: 'OH', name: 'PSA Airlines', color: '#0078D2', country: 'US' },
  { icao: 'JIA', iata: 'OH', name: 'PSA Airlines', color: '#0078D2', country: 'US' },
  { icao: 'GJS', iata: 'G7', name: 'GoJet Airlines', color: '#002244', country: 'US' },
  { icao: 'ASH', iata: 'YV', name: 'Mesa Airlines', color: '#002244', country: 'US' },
  { icao: 'CPZ', iata: 'C5', name: 'CommuteAir', color: '#002244', country: 'US' },
  { icao: 'SCX', iata: 'SY', name: 'Sun Country Airlines', color: '#F26522', country: 'US' },
  { icao: 'MXY', iata: 'MX', name: 'Breeze Airways', color: '#1C8DD6', country: 'US' },
  { icao: 'VXP', iata: 'XP', name: 'Avelo Airlines', color: '#5B2C83', country: 'US' },
  { icao: 'FDX', iata: 'FX', name: 'FedEx Express', cargo: true, color: '#4D148C', country: 'US' },
  { icao: 'UPS', iata: '5X', name: 'UPS Airlines', cargo: true, color: '#351C15', country: 'US' },
  { icao: 'GTI', iata: '5Y', name: 'Atlas Air', cargo: true, color: '#004B8D', country: 'US' },
  { icao: 'ABX', iata: 'GB', name: 'ABX Air', cargo: true, color: '#1F3A93', country: 'US' },
  { icao: 'ATN', iata: '8C', name: 'Air Transport International', cargo: true, color: '#1F3A93', country: 'US' },
  { icao: 'KAL', iata: 'KE', name: 'Korean Air', color: '#0064DE', country: 'KR' },
  { icao: 'AAR', iata: 'OZ', name: 'Asiana Airlines', color: '#C9252B', country: 'KR' },
  { icao: 'JAL', iata: 'JL', name: 'Japan Airlines', color: '#C8102E', country: 'JP' },
  { icao: 'ANA', iata: 'NH', name: 'All Nippon Airways', color: '#0B2F6B', country: 'JP' },
  { icao: 'CCA', iata: 'CA', name: 'Air China', color: '#C8102E', country: 'CN' },
  { icao: 'CES', iata: 'MU', name: 'China Eastern', color: '#1E3F8C', country: 'CN' },
  { icao: 'CSN', iata: 'CZ', name: 'China Southern', color: '#1C4B9C', country: 'CN' },
  { icao: 'CHH', iata: 'HU', name: 'Hainan Airlines', color: '#C8102E', country: 'CN' },
  { icao: 'CXA', iata: 'MF', name: 'Xiamen Airlines', color: '#1F4B99', country: 'CN' },
  { icao: 'CSZ', iata: 'ZH', name: 'Shenzhen Airlines', color: '#C8102E', country: 'CN' },
  { icao: 'CQH', iata: '9C', name: 'Spring Airlines', color: '#2E8B57', country: 'CN' },
  { icao: 'CPA', iata: 'CX', name: 'Cathay Pacific', color: '#006564', country: 'HK' },
  { icao: 'HDA', iata: 'KA', name: 'Cathay Dragon', color: '#B4101A', country: 'HK' },
  { icao: 'CAL', iata: 'CI', name: 'China Airlines', color: '#E6007E', country: 'TW' },
  { icao: 'EVA', iata: 'BR', name: 'EVA Air', color: '#00703C', country: 'TW' },
  { icao: 'SIA', iata: 'SQ', name: 'Singapore Airlines', color: '#F6B40E', country: 'SG' },
  { icao: 'SLK', iata: 'MI', name: 'SilkAir', color: '#005E9A', country: 'SG' },
  { icao: 'TGW', iata: 'TR', name: 'Scoot', color: '#FFD200', country: 'SG' },
  { icao: 'MAS', iata: 'MH', name: 'Malaysia Airlines', color: '#0E2D7B', country: 'MY' },
  { icao: 'AXM', iata: 'AK', name: 'AirAsia', color: '#E4002B', country: 'MY' },
  { icao: 'XAX', iata: 'D7', name: 'AirAsia X', color: '#E4002B', country: 'MY' },
  { icao: 'THA', iata: 'TG', name: 'Thai Airways', color: '#5A2A82', country: 'TH' },
  { icao: 'THD', iata: 'WE', name: 'Thai Smile', color: '#F58220', country: 'TH' },
  { icao: 'BKP', iata: 'PG', name: 'Bangkok Airways', color: '#0B4F9C', country: 'TH' },
  { icao: 'GIA', iata: 'GA', name: 'Garuda Indonesia', color: '#0B4F9C', country: 'ID' },
  { icao: 'LNI', iata: 'JT', name: 'Lion Air', color: '#E0001B', country: 'ID' },
  { icao: 'PAL', iata: 'PR', name: 'Philippine Airlines', color: '#1D4A9E', country: 'PH' },
  { icao: 'CEB', iata: '5J', name: 'Cebu Pacific', color: '#F7D117', country: 'PH' },
  { icao: 'HVN', iata: 'VN', name: 'Vietnam Airlines', color: '#0E4A8B', country: 'VN' },
  { icao: 'VJC', iata: 'VJ', name: 'VietJet Air', color: '#E31E24', country: 'VN' },
  { icao: 'AIC', iata: 'AI', name: 'Air India', color: '#E02927', country: 'IN' },
  { icao: 'IGO', iata: '6E', name: 'IndiGo', color: '#001B94', country: 'IN' },
  { icao: 'SEJ', iata: 'SG', name: 'SpiceJet', color: '#E31E24', country: 'IN' },
  { icao: 'VTI', iata: 'UK', name: 'Vistara', color: '#4B2E83', country: 'IN' },
  { icao: 'AXB', iata: 'IX', name: 'Air India Express', color: '#E02927', country: 'IN' },
  { icao: 'UAE', iata: 'EK', name: 'Emirates', color: '#D71921', country: 'AE' },
  { icao: 'ETD', iata: 'EY', name: 'Etihad Airways', color: '#BD8B13', country: 'AE' },
  { icao: 'FDB', iata: 'FZ', name: 'flydubai', color: '#0E4A8B', country: 'AE' },
  { icao: 'ABY', iata: 'G9', name: 'Air Arabia', color: '#D71921', country: 'AE' },
  { icao: 'QTR', iata: 'QR', name: 'Qatar Airways', color: '#5C0632', country: 'QA' },
  { icao: 'SVA', iata: 'SV', name: 'Saudia', color: '#006B3F', country: 'SA' },
  { icao: 'RXI', iata: 'XY', name: 'flynas', color: '#5C2D91', country: 'SA' },
  { icao: 'GFA', iata: 'GF', name: 'Gulf Air', color: '#B6985A', country: 'BH' },
  { icao: 'OMA', iata: 'WY', name: 'Oman Air', color: '#1B2F59', country: 'OM' },
  { icao: 'KAC', iata: 'KU', name: 'Kuwait Airways', color: '#0C4DA2', country: 'KW' },
  { icao: 'MSR', iata: 'MS', name: 'EgyptAir', color: '#0C2C84', country: 'EG' },
  { icao: 'RJA', iata: 'RJ', name: 'Royal Jordanian', color: '#512D6D', country: 'JO' },
  { icao: 'ELY', iata: 'LY', name: 'El Al', color: '#1E3D8F', country: 'IL' },
  { icao: 'THY', iata: 'TK', name: 'Turkish Airlines', color: '#C8102E', country: 'TR' },
  { icao: 'PGT', iata: 'PC', name: 'Pegasus Airlines', color: '#F7B500', country: 'TR' },
  { icao: 'SXS', iata: 'XQ', name: 'SunExpress', color: '#F58220', country: 'TR' },
  { icao: 'ETH', iata: 'ET', name: 'Ethiopian Airlines', color: '#118A3C', country: 'ET' },
  { icao: 'KQA', iata: 'KQ', name: 'Kenya Airways', color: '#C8102E', country: 'KE' },
  { icao: 'SAA', iata: 'SA', name: 'South African Airways', color: '#0C2C84', country: 'ZA' },
  { icao: 'RAM', iata: 'AT', name: 'Royal Air Maroc', color: '#C8102E', country: 'MA' },
  { icao: 'DAH', iata: 'AH', name: 'Air Algérie', color: '#C8102E', country: 'DZ' },
  { icao: 'TAR', iata: 'TU', name: 'Tunisair', color: '#C8102E', country: 'TN' },
  { icao: 'BAW', iata: 'BA', name: 'British Airways', color: '#075AAA', country: 'GB' },
  { icao: 'VIR', iata: 'VS', name: 'Virgin Atlantic', color: '#E10A0A', country: 'GB' },
  { icao: 'EZY', iata: 'U2', name: 'easyJet', color: '#FF6600', country: 'GB' },
  { icao: 'EJU', iata: 'EC', name: 'easyJet Europe', color: '#FF6600', country: 'AT' },
  { icao: 'EZS', iata: 'DS', name: 'easyJet Switzerland', color: '#FF6600', country: 'CH' },
  { icao: 'EXS', iata: 'LS', name: 'Jet2', color: '#D61C27', country: 'GB' },
  { icao: 'TOM', iata: 'BY', name: 'TUI Airways', color: '#D40E14', country: 'GB' },
  { icao: 'LOG', iata: 'LM', name: 'Loganair', color: '#1D1D5C', country: 'GB' },
  { icao: 'AUR', iata: 'AU', name: 'Aurigny', color: '#F7B500', country: 'GG' },
  { icao: 'RYR', iata: 'FR', name: 'Ryanair', color: '#073590', country: 'IE' },
  { icao: 'RUK', iata: 'RK', name: 'Ryanair UK', color: '#073590', country: 'GB' },
  { icao: 'EIN', iata: 'EI', name: 'Aer Lingus', color: '#00A65A', country: 'IE' },
  { icao: 'DLH', iata: 'LH', name: 'Lufthansa', color: '#05164D', country: 'DE' },
  { icao: 'CLH', iata: 'CL', name: 'Lufthansa CityLine', color: '#05164D', country: 'DE' },
  { icao: 'GEC', iata: 'LH', name: 'Lufthansa Cargo', cargo: true, color: '#05164D', country: 'DE' },
  { icao: 'EWG', iata: 'EW', name: 'Eurowings', color: '#AA0061', country: 'DE' },
  { icao: 'CFG', iata: 'DE', name: 'Condor', color: '#F2B800', country: 'DE' },
  { icao: 'TUI', iata: 'X3', name: 'TUIfly', color: '#D40E14', country: 'DE' },
  { icao: 'AFR', iata: 'AF', name: 'Air France', color: '#002157', country: 'FR' },
  { icao: 'HOP', iata: 'A5', name: 'HOP!', color: '#003C7D', country: 'FR' },
  { icao: 'TVF', iata: 'TO', name: 'Transavia France', color: '#00A651', country: 'FR' },
  { icao: 'TRA', iata: 'HV', name: 'Transavia', color: '#00A651', country: 'NL' },
  { icao: 'KLM', iata: 'KL', name: 'KLM', color: '#00A1DE', country: 'NL' },
  { icao: 'KLC', iata: 'WA', name: 'KLM Cityhopper', color: '#00A1DE', country: 'NL' },
  { icao: 'MPH', iata: 'MP', name: 'Martinair Cargo', cargo: true, color: '#00A1DE', country: 'NL' },
  { icao: 'BEL', iata: 'SN', name: 'Brussels Airlines', color: '#002B5C', country: 'BE' },
  { icao: 'SWR', iata: 'LX', name: 'Swiss', color: '#E30613', country: 'CH' },
  { icao: 'EDW', iata: 'WK', name: 'Edelweiss Air', color: '#E30613', country: 'CH' },
  { icao: 'AUA', iata: 'OS', name: 'Austrian Airlines', color: '#E2001A', country: 'AT' },
  { icao: 'IBE', iata: 'IB', name: 'Iberia', color: '#D7192D', country: 'ES' },
  { icao: 'IBS', iata: 'I2', name: 'Iberia Express', color: '#D7192D', country: 'ES' },
  { icao: 'VLG', iata: 'VY', name: 'Vueling', color: '#FFCC00', country: 'ES' },
  { icao: 'AEA', iata: 'UX', name: 'Air Europa', color: '#0A3A7E', country: 'ES' },
  { icao: 'VOE', iata: 'V7', name: 'Volotea', color: '#E30613', country: 'ES' },
  { icao: 'TAP', iata: 'TP', name: 'TAP Air Portugal', color: '#00843D', country: 'PT' },
  { icao: 'ITY', iata: 'AZ', name: 'ITA Airways', color: '#0B3B8E', country: 'IT' },
  { icao: 'AZA', iata: 'AZ', name: 'Alitalia', color: '#006643', country: 'IT' },
  { icao: 'NOZ', iata: 'OG', name: 'Neos', color: '#1A3F6B', country: 'IT' },
  { icao: 'WZZ', iata: 'W6', name: 'Wizz Air', color: '#C6007E', country: 'HU' },
  { icao: 'WUK', iata: 'W9', name: 'Wizz Air UK', color: '#C6007E', country: 'GB' },
  { icao: 'WMT', iata: '5W', name: 'Wizz Air Malta', color: '#C6007E', country: 'MT' },
  { icao: 'LOT', iata: 'LO', name: 'LOT Polish Airlines', color: '#1B2F8F', country: 'PL' },
  { icao: 'CSA', iata: 'OK', name: 'Czech Airlines', color: '#E2001A', country: 'CZ' },
  { icao: 'AEE', iata: 'A3', name: 'Aegean Airlines', color: '#1B3F8B', country: 'GR' },
  { icao: 'OAL', iata: 'OA', name: 'Olympic Air', color: '#1B3F8B', country: 'GR' },
  { icao: 'SAS', iata: 'SK', name: 'SAS Scandinavian', color: '#000F5D', country: 'SE' },
  { icao: 'NAX', iata: 'DY', name: 'Norwegian', color: '#D81939', country: 'NO' },
  { icao: 'NOZ', iata: 'D8', name: 'Norwegian Air Sweden', color: '#D81939', country: 'SE' },
  { icao: 'NSZ', iata: 'DY', name: 'Norwegian Air Sweden', color: '#D81939', country: 'SE' },
  { icao: 'WIF', iata: 'WF', name: 'Widerøe', color: '#0E5EA8', country: 'NO' },
  { icao: 'FIN', iata: 'AY', name: 'Finnair', color: '#0B1560', country: 'FI' },
  { icao: 'ICE', iata: 'FI', name: 'Icelandair', color: '#0A3D8F', country: 'IS' },
  { icao: 'BTI', iata: 'BT', name: 'airBaltic', color: '#9BC53D', country: 'LV' },
  { icao: 'AFL', iata: 'SU', name: 'Aeroflot', color: '#004C97', country: 'RU' },
  { icao: 'SBI', iata: 'S7', name: 'S7 Airlines', color: '#BED600', country: 'RU' },
  { icao: 'SDM', iata: 'FV', name: 'Rossiya', color: '#004C97', country: 'RU' },
  { icao: 'UTA', iata: 'UT', name: 'UTair', color: '#1E62A7', country: 'RU' },
  { icao: 'AUI', iata: 'PS', name: 'Ukraine International', color: '#0057B8', country: 'UA' },
  { icao: 'ACA', iata: 'AC', name: 'Air Canada', color: '#F01428', country: 'CA' },
  { icao: 'JZA', iata: 'QK', name: 'Jazz Aviation', color: '#F01428', country: 'CA' },
  { icao: 'ROU', iata: 'RV', name: 'Air Canada Rouge', color: '#A51C30', country: 'CA' },
  { icao: 'WJA', iata: 'WS', name: 'WestJet', color: '#0A6EB4', country: 'CA' },
  { icao: 'WEN', iata: 'WR', name: 'WestJet Encore', color: '#0A6EB4', country: 'CA' },
  { icao: 'POE', iata: 'PD', name: 'Porter Airlines', color: '#1D3F73', country: 'CA' },
  { icao: 'TSC', iata: 'TS', name: 'Air Transat', color: '#1A3F6B', country: 'CA' },
  { icao: 'FLE', iata: 'F8', name: 'Flair Airlines', color: '#8BC53F', country: 'CA' },
  { icao: 'AMX', iata: 'AM', name: 'Aeroméxico', color: '#0B2343', country: 'MX' },
  { icao: 'VOI', iata: 'Y4', name: 'Volaris', color: '#A4228C', country: 'MX' },
  { icao: 'VIV', iata: 'VB', name: 'Viva Aerobus', color: '#00A651', country: 'MX' },
  { icao: 'CMP', iata: 'CM', name: 'Copa Airlines', color: '#0A4A8C', country: 'PA' },
  { icao: 'AVA', iata: 'AV', name: 'Avianca', color: '#E1001A', country: 'CO' },
  { icao: 'LAN', iata: 'LA', name: 'LATAM Airlines', color: '#1B0088', country: 'CL' },
  { icao: 'TAM', iata: 'JJ', name: 'LATAM Brasil', color: '#1B0088', country: 'BR' },
  { icao: 'GLO', iata: 'G3', name: 'GOL Linhas Aéreas', color: '#FF7020', country: 'BR' },
  { icao: 'AZU', iata: 'AD', name: 'Azul', color: '#0B2F8A', country: 'BR' },
  { icao: 'ARG', iata: 'AR', name: 'Aerolíneas Argentinas', color: '#00B2E3', country: 'AR' },
  { icao: 'SKU', iata: 'H2', name: 'Sky Airline', color: '#5B2C83', country: 'CL' },
  { icao: 'QFA', iata: 'QF', name: 'Qantas', color: '#E40000', country: 'AU' },
  { icao: 'JST', iata: 'JQ', name: 'Jetstar', color: '#FF5115', country: 'AU' },
  { icao: 'VOZ', iata: 'VA', name: 'Virgin Australia', color: '#E10A0A', country: 'AU' },
  { icao: 'RXA', iata: 'ZL', name: 'Rex Airlines', color: '#0057A8', country: 'AU' },
  { icao: 'ANZ', iata: 'NZ', name: 'Air New Zealand', color: '#000000', country: 'NZ' },
  { icao: 'FJI', iata: 'FJ', name: 'Fiji Airways', color: '#1D1D5C', country: 'FJ' },
  { icao: 'CLX', iata: 'CV', name: 'Cargolux', cargo: true, color: '#1D3F73', country: 'LU' },
  { icao: 'BCS', iata: 'QY', name: 'DHL / European Air Transport', cargo: true, color: '#FFCC00', country: 'DE' },
  { icao: 'DHK', iata: 'D0', name: 'DHL Air UK', cargo: true, color: '#FFCC00', country: 'GB' },
  { icao: 'BOX', iata: '3S', name: 'AeroLogic', cargo: true, color: '#FFCC00', country: 'DE' },
  { icao: 'ABW', iata: 'RU', name: 'AirBridgeCargo', cargo: true, color: '#1D3F73', country: 'RU' },
  { icao: 'CKS', iata: 'K4', name: 'Kalitta Air', cargo: true, color: '#C8102E', country: 'US' },
  { icao: 'NCA', iata: 'KZ', name: 'Nippon Cargo Airlines', cargo: true, color: '#0B2F6B', country: 'JP' },
  { icao: 'CLX', iata: 'CV', name: 'Cargolux', cargo: true, color: '#1D3F73', country: 'LU' },
  { icao: 'SQC', iata: 'SQ', name: 'Singapore Airlines Cargo', cargo: true, color: '#F6B40E', country: 'SG' },
  { icao: 'CAO', iata: 'CA', name: 'Air China Cargo', cargo: true, color: '#C8102E', country: 'CN' },
  { icao: 'CKK', iata: 'CK', name: 'China Cargo Airlines', cargo: true, color: '#1E3F8C', country: 'CN' },
  { icao: 'CSS', iata: 'O3', name: 'SF Airlines', cargo: true, color: '#000000', country: 'CN' },
  { icao: 'TAY', iata: '3V', name: 'ASL Airlines Belgium', cargo: true, color: '#1D3F73', country: 'BE' },
  { icao: 'ABR', iata: '5O', name: 'ASL Airlines Ireland', cargo: true, color: '#1D3F73', country: 'IE' },
  { icao: 'QAC', iata: 'QR', name: 'Qatar Airways Cargo', cargo: true, color: '#5C0632', country: 'QA' },
  { icao: 'UAE', iata: 'EK', name: 'Emirates', color: '#D71921', country: 'AE' },
  { icao: 'MSX', iata: 'MS', name: 'EgyptAir Cargo', cargo: true, color: '#0C2C84', country: 'EG' },
  { icao: 'CJT', iata: 'W8', name: 'Cargojet', cargo: true, color: '#0A4A8C', country: 'CA' },
  { icao: 'PAC', iata: 'PO', name: 'Polar Air Cargo', cargo: true, color: '#004B8D', country: 'US' },
  { icao: 'SRR', iata: 'JX', name: 'Star Air', cargo: true, color: '#1D3F73', country: 'DK' },
  { icao: 'WDL', iata: 'WD', name: 'West Atlantic', cargo: true, color: '#1D3F73', country: 'SE' },
  { icao: 'AMZ', iata: 'M3', name: 'Amazon Air (Air Transport Services)', cargo: true, color: '#FF9900', country: 'US' },
  { icao: 'NJE', iata: '1I', name: 'NetJets', color: '#1D3F73', country: 'US' },
  { icao: 'EJA', iata: '1I', name: 'NetJets Aviation', color: '#1D3F73', country: 'US' },
  { icao: 'VJT', iata: 'VJ', name: 'VistaJet', color: '#C8102E', country: 'MT' },
  { icao: 'LXJ', iata: 'LJ', name: 'Flexjet', color: '#1D3F73', country: 'US' },
  { icao: 'JAS', iata: 'JS', name: 'Jet Aviation', color: '#1D3F73', country: 'CH' },
  { icao: 'GAMA', iata: 'GA', name: 'Gama Aviation', color: '#1D3F73', country: 'GB' },
  { icao: 'RCH', name: 'US Air Mobility Command (REACH)', color: '#2E4A1F', country: 'US' },
  { icao: 'CNV', name: 'US Navy', color: '#2E4A1F', country: 'US' },
  { icao: 'RRR', name: 'Royal Air Force (ASCOT)', color: '#2E4A1F', country: 'GB' },
  { icao: 'GAF', name: 'German Air Force', color: '#2E4A1F', country: 'DE' },
  { icao: 'FAF', name: 'French Air Force', color: '#2E4A1F', country: 'FR' },
  { icao: 'CFC', name: 'Canadian Forces', color: '#2E4A1F', country: 'CA' },
  { icao: 'IAM', name: 'Italian Air Force', color: '#2E4A1F', country: 'IT' },
  { icao: 'NATO', name: 'NATO', color: '#2E4A1F' },
  { icao: 'ASY', name: 'Royal Australian Air Force', color: '#2E4A1F', country: 'AU' },
];

const BY_ICAO = new Map<string, Airline>();
const BY_IATA = new Map<string, Airline>();
for (const a of AIRLINES) {
  if (!BY_ICAO.has(a.icao)) BY_ICAO.set(a.icao, a);
  if (a.iata && !BY_IATA.has(a.iata)) BY_IATA.set(a.iata, a);
}

export function airlineByIcao(icao?: string): Airline | undefined {
  return icao ? BY_ICAO.get(icao.toUpperCase()) : undefined;
}

export function airlineByIata(iata?: string): Airline | undefined {
  return iata ? BY_IATA.get(iata.toUpperCase()) : undefined;
}

/** Military callsign prefixes that are not in the airline table. */
const MILITARY_PREFIXES = new Set(['RCH', 'CNV', 'RRR', 'GAF', 'FAF', 'CFC', 'IAM', 'NATO', 'ASY', 'EVAC', 'DUKE', 'JAKE', 'KING', 'TOPCAT', 'SHELL', 'NAVY', 'ARMY', 'PAT', 'SAM', 'EXEC', 'VENUS', 'ROF', 'HKY', 'BAF', 'PLF', 'NOW', 'DAF', 'SVF', 'HAF', 'CTM', 'FNY']);

export interface ParsedCallsign {
  /** 3-letter ICAO operator prefix if the callsign looks like an airline callsign. */
  operator?: string;
  /** Trailing flight designator (digits plus optional letter suffix). */
  number?: string;
  /** IATA-style flight number when the operator is known, e.g. BA117. */
  flightNo?: string;
  airline?: Airline;
  military: boolean;
}

export function parseCallsign(cs?: string): ParsedCallsign {
  if (!cs) return { military: false };
  const s = cs.trim().toUpperCase();
  const m = /^([A-Z]{3})(\d{1,4}[A-Z]{0,2})$/.exec(s);
  if (!m) {
    const prefix = /^([A-Z]{2,5})/.exec(s)?.[1];
    const military = !!prefix && MILITARY_PREFIXES.has(prefix);
    return { military, operator: military ? prefix : undefined };
  }
  const operator = m[1];
  const number = m[2];
  const airline = BY_ICAO.get(operator);
  const military = MILITARY_PREFIXES.has(operator) || (!!airline && /Force|Navy|Mobility|NATO/.test(airline.name));
  const flightNo = airline?.iata ? `${airline.iata}${number.replace(/^0+/, '')}` : undefined;
  return { operator, number, flightNo, airline, military };
}
