const serverPort = import.meta.env.VITE_SERVER_PORT || '5000';
const baseUrl = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:${serverPort}`;

export const login_api = baseUrl + '/login';

export const activity_api = baseUrl + '/activity';

export const activity_info_api = baseUrl + '/activity-info';

export const general_api = baseUrl + '/general';

export const photo_api = baseUrl + '/photo';

export const qrcode_api = baseUrl + '/qrcode';

export const location_api = baseUrl + '/location';

export const uvtoken_api = baseUrl + '/uvtoken';

export const upload_api = baseUrl + '/upload';

export const ocr_api = baseUrl + '/qrocr';

export const monitor_status_api = baseUrl + '/monitor/status';

export const monitor_start_api = baseUrl + '/monitor/start';

export const monitor_stop_api = baseUrl + '/monitor/stop';

export const monitor_events_api = baseUrl + '/monitor/events';

export const courses_api = baseUrl + '/courses';

export const manual_sign_api = baseUrl + '/monitor/sign';

export const upload_pan_api = baseUrl + '/upload-pan';

export const pan_photos_api = baseUrl + '/pan-photos';
