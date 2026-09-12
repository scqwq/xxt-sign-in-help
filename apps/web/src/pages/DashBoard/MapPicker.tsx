import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapPickerProps {
  onClose: () => void;
  onConfirm: (lat: string, lon: string, address: string) => void;
}

export default function MapPicker({ onClose, onConfirm }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (!mapRef.current) return;

    // 高德地图瓦片（国内访问快，无需 API key）
    const amapLayer = L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}', {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 18,
      attribution: '高德地图',
    });

    const map = L.map(mapRef.current, {
      center: [39.9, 116.4], // 默认北京
      zoom: 12,
      layers: [amapLayer],
    });
    mapInstance.current = map;

    // 修复默认图标路径
    const defaultIcon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    });
    L.Marker.prototype.options.icon = defaultIcon;

    // 点击地图设置标记
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: clickedLat, lng: clickedLng } = e.latlng;
      setLat(clickedLat.toFixed(6));
      setLon(clickedLng.toFixed(6));

      if (markerRef.current) {
        markerRef.current.setLatLng(e.latlng);
      } else {
        markerRef.current = L.marker(e.latlng).addTo(map);
      }
    });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, []);

  const handleConfirm = () => {
    if (!lat || !lon) {
      alert('请先在地图上点击选择一个位置');
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
        <p style={{ color: '#8290a3', fontSize: '0.85rem', margin: '0 0 8px' }}>点击地图选择坐标，可手动填写地址</p>
        <div ref={mapRef} style={{ width: '100%', height: 350, borderRadius: 8, marginBottom: 12 }} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            className='input-area'
            placeholder='纬度（点击地图自动填入）'
            value={lat}
            readOnly
            style={{ flex: 1 }}
          />
          <input
            className='input-area'
            placeholder='经度（点击地图自动填入）'
            value={lon}
            readOnly
            style={{ flex: 1 }}
          />
        </div>
        <input
          className='input-area'
          placeholder='地址（如：河南省郑州市xx大学）'
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={{ width: '100%', marginBottom: 12 }}
        />
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
