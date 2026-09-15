/**
 * 天气查询技能（get_weather）
 *
 * 借鉴 HoloJarvis 的 get_weather 工具。用 Open-Meteo（免费免 key API）：
 * - 按城市名查询经纬度（geocoding API）
 * - 获取当前天气 + 今日温度范围
 * - 输出中文本地化描述
 *
 * 无 key、无配置、离线兜底（API 失败时返回友好提示）。
 */
import { registerSkill } from './registry.js';

// 常见城市名 → 坐标兜底（避免 geocoding 每次调用；缺失时走 API 查询）
const CITY_COORDS: Record<string, [number, number]> = {
  北京: [39.9042, 116.4074],
  上海: [31.2304, 121.4737],
  广州: [23.1291, 113.2644],
  深圳: [22.5431, 114.0579],
  杭州: [30.2741, 120.1551],
  成都: [30.5728, 104.0668],
  武汉: [30.5928, 114.3055],
  西安: [34.3416, 108.9398],
  南京: [32.0603, 118.7969],
  重庆: [29.563, 106.5516],
  苏州: [31.2989, 120.5853],
  天津: [39.3434, 117.3616],
  长沙: [28.2282, 112.9388],
  郑州: [34.7466, 113.6254],
  青岛: [36.0671, 120.3826],
  沈阳: [41.8057, 123.4315],
  厦门: [24.4798, 118.0894],
  香港: [22.3193, 114.1694],
  台北: [25.033, 121.5654],
};

const WMO_WEATHER: Record<number, string> = {
  0: '晴朗', 1: '大部晴朗', 2: '多云', 3: '阴天',
  45: '雾', 48: '雾凇',
  51: '毛毛雨', 53: '小雨', 55: '中雨', 56: '冻雨', 57: '强冻雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '强阵雨', 82: '暴雨', 85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷暴伴冰雹',
};

/** 城市名 → 经纬度（内置表优先，未命中走 geocoding API） */
async function resolveCity(name: string): Promise<{ lat: number; lon: number; city: string }> {
  const clean = name.trim().replace(/市|省|县/g, '');
  if (CITY_COORDS[clean]) {
    const [lat, lon] = CITY_COORDS[clean];
    return { lat, lon, city: clean };
  }
  // 兜底：Open-Meteo geocoding（中文城市名，取第一个结果）
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(clean)}&count=1&language=zh`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const data = await res.json() as { results?: Array<{ latitude: number; longitude: number; name?: string }> };
  const hit = data.results?.[0];
  if (!hit) throw new Error(`未找到城市「${name}」的天气数据`);
  return { lat: hit.latitude, lon: hit.longitude, city: hit.name || clean };
}

registerSkill({
  name: 'get_weather',
  description:
    '查询城市当前天气。当用户问"天气""今天冷不冷""下雨吗""气温"时使用。参数 city 为城市名（如"北京"），缺省用上次查询或返回提示。',
  args: [
    { name: 'city', type: 'string', required: true, description: '城市名，如 北京/上海/广州' },
  ],
  execute: async (args) => {
    const city = String(args.city || '').trim();
    if (!city) return '错误: 请提供城市名，如"北京"';

    try {
      const { lat, lon, city: resolved } = await resolveCity(city);

      // Open-Meteo 当前天气 + 今日温度（免 key）
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m` +
        `&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`天气服务响应 ${res.status}`);
      const data = await res.json() as {
        current?: { temperature_2m?: number; weather_code?: number; relative_humidity_2m?: number; wind_speed_10m?: number };
        daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
      };

      const cur = data.current || {};
      const t = Math.round(cur.temperature_2m ?? 0);
      const wmo = WMO_WEATHER[cur.weather_code ?? 0] ?? '未知';
      const hum = Math.round(cur.relative_humidity_2m ?? 0);
      const wind = Math.round(cur.wind_speed_10m ?? 0);
      const max = data.daily?.temperature_2m_max?.[0];
      const min = data.daily?.temperature_2m_min?.[0];
      const range = max !== undefined && min !== undefined ? `（今日 ${Math.round(min)}~${Math.round(max)}℃）` : '';

      return `📍 ${resolved} 当前天气：${wmo}，气温 ${t}℃ ${range}，湿度 ${hum}%，风速 ${wind} km/h`;
    } catch (err) {
      return `⚠️ 天气查询失败：${err instanceof Error ? err.message : '未知错误'}（请检查网络或确认城市名）`;
    }
  },
});
