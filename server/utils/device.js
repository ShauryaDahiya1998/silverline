// Lightweight User-Agent parsing — enough to record "what kind of device
// created this Help ID" without pulling in an external UA-parsing package.
// Not exhaustive; falls back to 'Unknown' for anything unrecognized rather
// than guessing.
function parseDevice(userAgent) {
const ua = userAgent || '';
let type = 'Unknown';
let brand = 'Unknown';

if (/iPad/i.test(ua)) {
type = 'Tablet';
brand = 'Apple';
} else if (/iPhone|iPod/i.test(ua)) {
type = 'Mobile';
brand = 'Apple';
} else if (/Macintosh/i.test(ua)) {
type = 'Desktop';
brand = 'Apple';
} else if (/Android/i.test(ua)) {
type = /Mobile/i.test(ua) ? 'Mobile' : 'Tablet';
if (/SM-|Galaxy/i.test(ua)) brand = 'Samsung';
else if (/Pixel/i.test(ua)) brand = 'Google';
else if (/OnePlus/i.test(ua)) brand = 'OnePlus';
else if (/Redmi|Xiaomi|MI\s/i.test(ua)) brand = 'Xiaomi';
else if (/Huawei/i.test(ua)) brand = 'Huawei';
else brand = 'Android device';
} else if (/Windows/i.test(ua)) {
type = 'Desktop';
brand = 'Windows PC';
} else if (/CrOS/i.test(ua)) {
type = 'Desktop';
brand = 'Chromebook';
} else if (/Linux/i.test(ua)) {
type = 'Desktop';
brand = 'Linux PC';
}

return { type, brand };
}

module.exports = { parseDevice };
