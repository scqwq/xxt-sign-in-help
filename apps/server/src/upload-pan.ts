/**
 * 云盘图片上传小工具。
 * 用法：pnpm upload-pan <本地图片路径>
 * 选一个已登录的用户，把图片传到超星云盘，打印返回的 objectId。
 */
import fs from 'fs';
import { blue, red } from 'kolorist';
import prompts from 'prompts';
import { uploadPhoto } from './functions/photo';
import { getLocalUsers, getPanToken } from './functions/user';
import { dbGetAllUsers } from './utils/db';
import { restoreTerminal } from './utils/terminal';

restoreTerminal();

const PromptsOptions = {
  onCancel: () => { restoreTerminal(); process.exit(0); },
};

(async () => {
  const filePath = process.argv[2];
  if (!filePath || !fs.existsSync(filePath)) {
    console.log(red('用法：pnpm upload-pan <本地图片路径>'));
    console.log('示例：pnpm upload-pan D:/photos/sign.jpg');
    process.exit(1);
  }

  const users = dbGetAllUsers();
  if (!users || users.length === 0) {
    console.log(red('没有本地用户，请先 pnpm start 登录一次。'));
    process.exit(1);
  }

  const { userItem } = await prompts({
    type: 'select', name: 'userItem', message: '选择用户',
    choices: getLocalUsers(), initial: 0,
  }, PromptsOptions);
  if (userItem === -1) { console.log(red('请先登录保存凭证')); process.exit(0); }

  const user = users[userItem];
  const cookies = { ...user.params } as BasicCookie;

  console.log(blue(`正在为 ${user.phone} 上传 ${filePath} ...`));
  const buffer = fs.readFileSync(filePath);
  const tokenRes = await getPanToken(cookies);
  const token = JSON.parse(tokenRes)._token;
  const uploadRes = await uploadPhoto({ ...cookies, buffer, token });
  const parsed = JSON.parse(uploadRes);

  console.log(blue('上传完成！'));
  console.log('objectId:', parsed.objectId);
  console.log('完整返回：', uploadRes);
})().catch((e) => {
  console.error(red('[上传失败]'), e);
  process.exit(1);
});
