import { encode, QrCodeDataType } from 'uqr'

export const SITE_QR_URL = 'https://www.betaclimb.ru/'

const QUIET = 4
const CORNER = 0.42
const BLEED = 0.03

const MARK = [
  'M0.261169 92.8128L11.0508 78.1965L14.3344 74.9301L17.618 71.6637C17.618 71.6637 19.9768 70.0975 21.116 68.7249C22.2896 67.3108 23.4036 64.614 23.4036 64.614L27.1545 67.5652L30.3536 74.1923L34.0099 69.3524L31.6184 66.5528C31.6184 66.5528 36.2915 57.1077 37.1475 56.0788C37.3797 55.8035 41.2803 53.7211 43.4712 50.8229C50.5518 41.4475 50.1879 40.6609 50.304 40.6319C50.42 40.603 51.5005 41.1261 53.764 44.1256C54.4314 45.0096 55.5418 45.682 55.9626 46.1891C56.3833 46.7108 56.4456 47.9578 56.6778 48.3055C56.9244 48.6388 57.6846 51.2472 59.3532 53.4643C61.0218 55.6959 63.1056 56.1498 64.1213 57.5119C65.7753 59.7435 66.9961 63.4674 69.4191 66.7712C70.2461 67.887 72.3184 69.2193 75.2203 73.3056C76.9904 75.7835 81.0928 82.4954 84.1688 87.031C87.6511 92.1317 88.7248 93.6677 88.8989 93.7257C89.2471 93.8561 91.0027 92.5809 92.6858 90.958C95.5006 88.2627 97.7061 84.7705 98.8668 81.1913C100.535 76.0036 100.361 70.4392 98.3445 65.2226C96.6904 60.9623 93.658 56.9774 89.8855 54.1227C86.4323 51.5144 82.834 49.8915 77.8427 48.6743C76.624 48.3844 72.7354 47.6744 72.5758 47.7179C72.5178 47.7324 71.9955 47.7034 71.4296 47.6309C70.3704 47.5295 69.9787 47.3266 70.472 47.1672C73.8527 46.008 77.48 44.0517 80.1062 41.9216C82.5873 39.9219 85.3441 36.589 86.6209 34.0677C89.4212 28.5322 89.7839 22.2433 87.6801 16.1717C85.1264 8.79597 78.8149 2.79684 71.6037 0.884079C68.4842 0.0581131 71.241 0.116081 34.1405 0.0581207L0 0.000152588L0.261169 92.8128Z',
  'M50.3185 59.9623C49.9848 60.0493 47.7274 64.41 47.858 64.6274C47.916 64.7143 46.5606 65.2224 46.4735 65.179C46.3864 65.121 45.8077 66.5842 44.7485 68.0043C43.7039 69.4099 42.1207 70.7434 41.6564 71.3809C38.8416 75.163 38.7826 77.1712 37.5928 78.7941C36.8528 79.7795 34.5468 80.9738 33.5892 82.2634C30.8904 85.8861 24.3032 94.7689 22.8668 96.7251C22.1558 97.6815 21.3288 98.7973 21.0241 99.203C20.7194 99.5942 20.5017 99.942 20.5162 99.9565C20.5453 99.9855 31.6739 100 45.2692 100C72.3727 100 71.6182 100.014 76.0436 99.1161C78.9455 98.5219 81.6732 97.6235 83.7335 96.5802L84.459 96.2179L83.9802 95.6093C83.719 95.276 82.7904 94.1168 81.9054 93.0445C81.0348 91.9722 79.845 90.5086 79.2937 89.8131C78.7278 89.103 78.6504 87.8794 78.2441 87.3867C77.8524 86.8795 76.2259 84.757 74.6299 82.7863C73.0339 80.8155 70.7041 79.1334 70.2979 78.6263C69.2677 77.3511 67.8043 74.8928 67.2384 74.2262L66.3658 73.8878L65.6955 74.8408C65.3327 75.1306 63.7251 75.9455 63.7251 75.9455C63.7251 75.9455 56.6552 68.6087 56.0168 67.7682C55.6975 67.348 55.6289 66.0774 55.2662 65.6427C54.8889 65.2079 54.8664 64.2817 54.4746 63.76C54.0684 63.2384 53.7876 62.8614 53.686 62.8614C53.5844 62.8614 52.7561 62.8749 52.7415 62.7445C52.698 62.5127 51.0439 60.2811 50.7393 60.0348C50.6377 59.9768 50.4491 59.9333 50.3185 59.9623Z',
]

function num(value: number) {
  return String(Math.round(value * 1000) / 1000)
}

function roundedModule(
  x: number,
  y: number,
  w: number,
  h: number,
  rtl: number,
  rtr: number,
  rbr: number,
  rbl: number,
) {
  return [
    `M${num(x + rtl)} ${num(y)}`,
    `H${num(x + w - rtr)}`,
    rtr ? `A${num(rtr)} ${num(rtr)} 0 0 1 ${num(x + w)} ${num(y + rtr)}` : '',
    `V${num(y + h - rbr)}`,
    rbr ? `A${num(rbr)} ${num(rbr)} 0 0 1 ${num(x + w - rbr)} ${num(y + h)}` : '',
    `H${num(x + rbl)}`,
    rbl ? `A${num(rbl)} ${num(rbl)} 0 0 1 ${num(x)} ${num(y + h - rbl)}` : '',
    `V${num(y + rtl)}`,
    rtl ? `A${num(rtl)} ${num(rtl)} 0 0 1 ${num(x + rtl)} ${num(y)}` : '',
    'Z',
  ].join('')
}

function logoWindow(size: number, types: number[][]) {
  for (const span of [7, 5]) {
    const row = Math.floor((size - span) / 2)
    let clear = true
    for (let r = row; r < row + span && clear; r++) {
      for (let c = row; c < row + span; c++) {
        if (types[r][c] !== QrCodeDataType.Data) clear = false
      }
    }
    if (clear) return { row, span }
  }
  return null
}

export function siteQrGraphic(url = SITE_QR_URL) {
  const qr = encode(url, { ecc: 'H', border: 0, boostEcc: true })
  const logo = logoWindow(qr.size, qr.types)
  const total = qr.size + QUIET * 2

  const covered = (row: number, col: number) =>
    logo != null && row >= logo.row && row < logo.row + logo.span && col >= logo.row && col < logo.row + logo.span

  const dark = (row: number, col: number) => {
    if (row < 0 || col < 0 || row >= qr.size || col >= qr.size) return false
    if (qr.types[row][col] === QrCodeDataType.Position) return false
    if (covered(row, col)) return false
    return qr.data[row][col]
  }

  const dots: string[] = []
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (!dark(row, col)) continue
      const north = dark(row - 1, col)
      const south = dark(row + 1, col)
      const west = dark(row, col - 1)
      const east = dark(row, col + 1)
      dots.push(
        roundedModule(
          col + QUIET - (west ? BLEED : 0),
          row + QUIET - (north ? BLEED : 0),
          1 + (west ? BLEED : 0) + (east ? BLEED : 0),
          1 + (north ? BLEED : 0) + (south ? BLEED : 0),
          !north && !west ? CORNER : 0,
          !north && !east ? CORNER : 0,
          !south && !east ? CORNER : 0,
          !south && !west ? CORNER : 0,
        ),
      )
    }
  }

  const finders: { key: string; x: number; y: number }[] = []
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (qr.types[row][col] !== QrCodeDataType.Position || !qr.data[row][col]) continue
      const above = row > 0 && qr.types[row - 1][col] === QrCodeDataType.Position && qr.data[row - 1][col]
      const left = col > 0 && qr.types[row][col - 1] === QrCodeDataType.Position && qr.data[row][col - 1]
      const ring = qr.types[row + 1]?.[col + 1] === QrCodeDataType.Position && !qr.data[row + 1][col + 1]
      const far = row + 6 < qr.size && col + 6 < qr.size && qr.data[row + 6][col + 6]
      if (above || left || !ring || !far) continue
      finders.push({ key: `${row}-${col}`, x: col + QUIET, y: row + QUIET })
    }
  }

  const pad = 1.05
  const plate = logo
    ? {
        x: logo.row + QUIET - 0.02,
        y: logo.row + QUIET - 0.02,
        size: logo.span + 0.04,
        rx: 1.7,
        transform: `translate(${num(logo.row + QUIET + pad)} ${num(logo.row + QUIET + pad)}) scale(${num((logo.span - pad * 2) / 100)})`,
      }
    : null

  return {
    viewBox: `0 0 ${total} ${total}`,
    dots: dots.join(''),
    finders,
    plate,
    mark: MARK,
  }
}
