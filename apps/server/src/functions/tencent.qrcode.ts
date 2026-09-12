// eslint-disable-next-line @typescript-eslint/no-var-requires
const tencentcloud = require('tencentcloud-sdk-nodejs');
const OcrClient = tencentcloud.ocr.v20181119.Client;
import { getAppConfig } from '../config';

type QrScanFunc = (source: string, type: 'base64' | 'url') => Promise<any>;

export const QrCodeScan: QrScanFunc = async (source, type) => {
  let result;
  const payload: any = {};
  const client = new OcrClient({
    credential: {
      secretId: getAppConfig().tencent.secretId,
      secretKey: getAppConfig().tencent.secretKey,
    },
    region: 'ap-shanghai',
    profile: {
      httpProfile: {
        endpoint: 'ocr.tencentcloudapi.com',
      },
    },
  });
  type === 'base64' ? payload.ImageBase64 = source : payload.ImageUrl = source;
  try {
    result = await client.QrcodeOCR(payload);
  } catch (err) {
    result = '';
  }
  return result;
};
