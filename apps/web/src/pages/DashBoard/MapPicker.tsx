import { useEffect, useRef, useState, CSSProperties } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { gcj02ToWgs84, wgs84ToGcj02, gcj02ToBd09 } from '../../utils/gcoord';

interface MapSettings {
  amapKey: string;
  defaultCity: string;
  defaultLat: number;
  defaultLon: number;
  centerMode: string;
  customLat: number;
  customLon: number;
  coordMode: string;
  successAutoHide: number;
}

const DEFAULT_MAP_SETTINGS: MapSettings = {
  amapKey: '',
  defaultCity: '北京',
  defaultLat: 39.9042,
  defaultLon: 116.4074,
  centerMode: 'city',
  customLat: 39.9042,
  customLon: 116.4074,
  coordMode: 'bd09',
  successAutoHide: 30,
};

function loadMapSettings(): MapSettings {
  try {
    const raw = localStorage.getItem('map_settings');
    if (raw) return { ...DEFAULT_MAP_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_MAP_SETTINGS;
}

interface SearchTip {
  name: string;
  district: string;
  location: string;
  address?: string;
}

interface MapPickerProps {
  onClose: () => void;
  onConfirm: (lat: string, lon: string, address: string) => void;
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: '0.9rem',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  background: '#f8fafc',
  color: '#334155',
  outline: 'none',
  boxSizing: 'border-box',
};

const coordModeLabel: Record<string, string> = {
  none: '不转换（发送原始坐标）',
  wgs84: '已转换为 WGS-84 (GPS坐标)',
  gcj02: '已转换为 GCJ-02 (高德坐标)',
  bd09: '已转换为 BD-09 (百度坐标)',
};

export default function MapPicker({ onClose, onConfirm }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [address, setAddress] = useState('');
  const settings = useRef<MapSettings>(loadMapSettings());

  // 搜索状态
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<SearchTip[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 设置标记并按选定模式转换坐标
  const setMarkerAndCoords = (rawLat: number, rawLng: number) => {
    if (!mapInstance.current) return;
    const latlng: L.LatLngExpression = [rawLat, rawLng];
    if (markerRef.current) {
      markerRef.current.setLatLng(latlng);
    } else {
      markerRef.current = L.marker(latlng).addTo(mapInstance.current);
    }
    let finalLng = rawLng;
    let finalLat = rawLat;
    const mode = settings.current.coordMode;
    if (mode === 'wgs84') {
      [finalLng, finalLat] = gcj02ToWgs84(rawLng, rawLat);
    } else if (mode === 'gcj02') {
      [finalLng, finalLat] = wgs84ToGcj02(rawLng, rawLat);
    } else if (mode === 'bd09') {
      [finalLng, finalLat] = gcj02ToBd09(rawLng, rawLat);
    }
    setLat(finalLat.toFixed(6));
    setLon(finalLng.toFixed(6));
  };

  useEffect(() => {
    if (!mapRef.current) return;

    const amapLayer = L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 18,
      attribution: '高德地图',
    });

    const map = L.map(mapRef.current, {
      center: [settings.current.centerMode === 'custom' ? settings.current.customLat : settings.current.defaultLat, settings.current.centerMode === 'custom' ? settings.current.customLon : settings.current.defaultLon],
      zoom: 12,
      layers: [amapLayer],
    });
    mapInstance.current = map;

    const defaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    });
    L.Marker.prototype.options.icon = defaultIcon;

    map.on('click', (e: L.LeafletMouseEvent) => {
      setMarkerAndCoords(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  const handleSearchInput = (text: string) => {
    setSearchText(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim() || !settings.current.amapKey) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const url = `https://restapi.amap.com/v3/assistant/inputtips?key=${settings.current.amapKey}&keywords=${encodeURIComponent(text.trim())}&city=${encodeURIComponent(settings.current.defaultCity)}&datatype=all`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === '1' && Array.isArray(data.tips)) {
          setSearchResults(data.tips.filter((t: any) => t.location && t.location.length > 0).slice(0, 10));
          setShowResults(true);
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const handleSelectTip = (tip: SearchTip) => {
    const parts = tip.location.split(',');
    const lng = Number(parts[0]);
    const latNum = Number(parts[1]);
    if (!mapInstance.current || isNaN(latNum) || isNaN(lng)) return;
    mapInstance.current.setView([latNum, lng], 16);
    setMarkerAndCoords(latNum, lng);
    const fullAddress = tip.address ? `${tip.name}（${tip.address}）` : tip.name;
    setAddress(fullAddress);
    setSearchText(fullAddress);
    setShowResults(false);
  };

  const handleConfirm = () => {
    if (!lat || !lon) {
      alert('请先在地图上点击或搜索选择一个位置');
      return;
    }
    onConfirm(lat, lon, address || '未填写地址');
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: 16,
        width: 'min(700px, 90vw)', maxHeight: '90vh', overflow: 'auto',
      }}>
        <h3 style={{ margin: '0 0 12px', color: '#334155' }}>选择签到位置</h3>
        <p style={{ color: '#8290a3', fontSize: '0.85rem', margin: '0 0 8px' }}>点击地图或搜索地址选择坐标</p>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            style={inputStyle}
            placeholder={settings.current.amapKey ? '搜索地点（如：天安门、xx大学）' : '请先在左下角地图设置中配置高德API Key后可搜索'}
            value={searchText}
            onChange={(e) => handleSearchInput(e.target.value)}
            onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
            onBlur={() => setTimeout(() => setShowResults(false), 200)}
          />
          {searching && <span style={{ position: 'absolute', right: 12, top: 10, color: '#94a3b8', fontSize: '0.8rem' }}>搜索中...</span>}
          {showResults && searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 200, overflow: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {searchResults.map((tip, i) => (
                <div
                  key={i}
                  onMouseDown={() => handleSelectTip(tip)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: i < searchResults.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ fontWeight: 500, fontSize: '0.9rem', color: '#334155' }}>{tip.name}</div>
                  {tip.district && <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{tip.district}{tip.address ? ' · ' + tip.address : ''}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div ref={mapRef} style={{ width: '100%', height: 350, borderRadius: 8, marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder='纬度（自动填入）'
            value={lat}
            readOnly
          />
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder='经度（自动填入）'
            value={lon}
            readOnly
          />
        </div>
        <input
          style={{ ...inputStyle, marginBottom: 4 }}
          placeholder='地址（如：河南省郑州市xx大学）'
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 12px' }}>{coordModeLabel[settings.current.coordMode] || ''}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#64748b', cursor: 'pointer' }}
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer' }}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
