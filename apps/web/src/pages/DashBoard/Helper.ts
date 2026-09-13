import { Decoder } from '@nuintun/qrcode';
import { courses_api, general_api, location_api, manual_sign_api, ocr_api, pan_photos_api, photo_api, qrcode_api, upload_api, upload_pan_api, uvtoken_api } from '../../config/api';
import { fetch as Fetch } from '../../utils/request';

export const generalSign = async (userParams: UserParamsType, activeId: number | undefined) => {
  const result = await Fetch(general_api, {
    method: 'POST',
    body: {
      uf: userParams.uf,
      _d: userParams._d,
      vc3: userParams.vc3,
      uid: userParams._uid,
      fid: userParams.fid,
      activeId: activeId,
      name: userParams.name,
    },
    type: 'text'
  });
  return result;
};

export const photoSign = async (userParams: UserParamsType, activeId: number | undefined, objectId: string) => {
  const result = await Fetch(photo_api, {
    method: 'POST',
    body: {
      uf: userParams.uf,
      _d: userParams._d,
      vc3: userParams.vc3,
      uid: userParams._uid,
      fid: userParams.fid,
      activeId: activeId,
      name: userParams.name,
      objectId: objectId,
    },
    type: 'text'
  });
  return result;
};

export const qrcodeSign = async (userParams: UserParamsType, activeId: number | undefined, enc: string, lat: string, lon: string,
  address: string, altitude: string) => {
  const result = await Fetch(qrcode_api, {
    method: 'POST',
    body: {
      uf: userParams.uf,
      _d: userParams._d,
      vc3: userParams.vc3,
      uid: userParams._uid,
      fid: userParams.fid,
      activeId: activeId,
      name: userParams.name,
      enc: enc,
      lat: lat,
      lon: lon,
      address: address,
      altitude
    },
    type: 'text'
  });
  return result;
};

export const locationSign = async (
  userParams: UserParamsType,
  activeId: number | undefined,
  lat: string,
  lon: string,
  address: string
) => {
  const result = await Fetch(location_api, {
    method: 'POST',
    body: {
      uf: userParams.uf,
      _d: userParams._d,
      vc3: userParams.vc3,
      uid: userParams._uid,
      fid: userParams.fid,
      activeId: activeId,
      name: userParams.name,
      lat: lat,
      lon: lon,
      address: address,
    },
    type: 'text'
  });
  return result;
};

export const getuvToken = async (userParams: UserParamsType) => {
  const token = await Fetch(uvtoken_api, {
    method: 'POST',
    body: {
      uf: userParams.uf,
      _d: userParams._d,
      vc3: userParams.vc3,
      uid: userParams._uid,
    },
    type: 'json'
  });
  return token._token;
};

// [默认] 使用浏览器解析ENC，成功率较低
export const parseEnc = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const url = window.URL || window.webkitURL;
    const img = new Image();
    const qrcode = new Decoder();
    img.src = url.createObjectURL(file);
    qrcode
      .scan(img.src)
      .then((result: any) => {
        const enc_start = result.data.indexOf('enc=') + 4;
        const rs = result.data.substring(enc_start, result.data.indexOf('&', enc_start));
        resolve(rs);
      })
      .catch((reason: any) => {
        console.log(reason);
        resolve('识别失败');
      });
  });
};

// [推荐] 使用腾讯云OCR解析ENC，请在cli项目中配置secretId和secretKey
// export const parseEnc = async (inputFile: File) => {
//   const data = new FormData();
//   data.append('file', inputFile);
//   const res = await Fetch(ocr_api, {
//     method: 'POST',
//     body: data,
//     type: 'text'
//   });
//   return res;
// };

export const uploadFile = async (userParams: UserParamsType, inputFile: File, token: string) => {
  // 填入FormData
  const data = new FormData();
  data.append('uf', userParams.uf);
  data.append('_d', userParams._d);
  data.append('_uid', userParams._uid);
  data.append('vc3', userParams.vc3);
  data.append('file', inputFile);

  // 使用Token传文件，返回objectId
  const res = await Fetch(upload_api + `?_token=${token}`, {
    method: 'POST',
    body: data
  });
  return res;
};

export const showResultWithTransition = (cb_setStatus: (res: string) => void, value: string) => {
  (document.getElementById('sign-btn') as HTMLButtonElement).disabled = true;
  const neum_form = document.getElementsByClassName('neum-form')[0];
  const content = document.getElementById('neum-form-content');
  content!.style.opacity = '0';
  setTimeout(() => {
    content!.style.display = 'none';
    neum_form.classList.add('form-height');
    cb_setStatus(value);
  }, 600);
};

// ===================== 课程管理 =====================

export const getCourses = async (phone: string) => {
  return await Fetch(`${courses_api}/${phone}`, { type: 'json' });
};

export const saveCourse = async (phone: string, course: { courseId: string; courseName?: string; autoSign?: boolean; photoPath?: string }) => {
  return await Fetch(`${courses_api}/${phone}`, { method: 'POST', body: course, type: 'json' });
};

export const deleteCourse = async (phone: string, courseId: string) => {
  return await Fetch(`${courses_api}/${phone}/${courseId}`, { method: 'DELETE', type: 'json' });
};

// ===================== 手动签到（统一入口） =====================

export const manualSign = async (phone: string, body: any) => {
  return await Fetch(`${manual_sign_api}/${phone}`, { method: 'POST', body, type: 'json' });
};

export const manualPhotoSign = async (phone: string, fields: any, photoFile: File) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.append(k, String(v));
  data.append('file', photoFile);
  return await Fetch(`${manual_sign_api}/${phone}`, { method: 'POST', body: data, type: 'json' });
};

// ===================== 云盘上传 =====================

export const uploadToPan = async (phone: string, photoFile: File) => {
  const data = new FormData();
  data.append('file', photoFile);
  return await Fetch(`${upload_pan_api}/${phone}`, { method: 'POST', body: data, type: 'json' });
};

// 查询云盘中的图片（0.jpg/0.png），返回 objectId
export const getPanPhoto = async (phone: string, photoName?: string) => {
  const query = photoName ? `?name=${encodeURIComponent(photoName)}` : '';
  return await Fetch(`${pan_photos_api}/${phone}${query}`, { type: 'json' });
};

// 使用云盘图片 objectId 进行拍照签到
export const signWithPanPhoto = async (phone: string, fields: any) => {
  return await Fetch(`${manual_sign_api}/${phone}`, { method: 'POST', body: fields, type: 'json' });
};
