interface HoldSpec {
  x: string
  y: string
  color: string
  size: number
}

interface WallSpec {
  background: string
  holds: HoldSpec[]
  personX: string
  personY: string
}

const WALLS: WallSpec[] = [
  {
    background: 'linear-gradient(165deg, #8b7b72 0%, #4a403b 42%, #1c1917 100%)',
    holds: [
      { x: '22%', y: '18%', color: '#e24b4b', size: 16 },
      { x: '68%', y: '28%', color: '#3d9a52', size: 20 },
      { x: '34%', y: '46%', color: '#f0c14a', size: 14 },
      { x: '72%', y: '62%', color: '#3d9a52', size: 18 },
      { x: '28%', y: '74%', color: '#e24b4b', size: 12 },
    ],
    personX: '48%',
    personY: '58%',
  },
  {
    background: 'linear-gradient(160deg, #6e8eab 0%, #31485c 46%, #17222b 100%)',
    holds: [
      { x: '70%', y: '16%', color: '#f2c14e', size: 18 },
      { x: '30%', y: '34%', color: '#ff7a3c', size: 14 },
      { x: '62%', y: '48%', color: '#f2c14e', size: 16 },
      { x: '24%', y: '66%', color: '#7dcea0', size: 20 },
      { x: '58%', y: '78%', color: '#ff7a3c', size: 12 },
    ],
    personX: '44%',
    personY: '54%',
  },
  {
    background: 'linear-gradient(180deg, #c9845a 0%, #6d4634 40%, #241710 100%)',
    holds: [
      { x: '26%', y: '22%', color: '#ffe08a', size: 15 },
      { x: '66%', y: '30%', color: '#ff5d3a', size: 18 },
      { x: '40%', y: '50%', color: '#ffe08a', size: 12 },
      { x: '74%', y: '64%', color: '#7bc67e', size: 16 },
      { x: '32%', y: '76%', color: '#ff5d3a', size: 14 },
    ],
    personX: '52%',
    personY: '60%',
  },
  {
    background: 'linear-gradient(165deg, #b9b4ae 0%, #6d6762 38%, #2a2725 100%)',
    holds: [
      { x: '18%', y: '24%', color: '#4aa3e8', size: 16 },
      { x: '60%', y: '20%', color: '#ef5b8a', size: 14 },
      { x: '74%', y: '46%', color: '#4aa3e8', size: 18 },
      { x: '36%', y: '58%', color: '#f2c14e', size: 15 },
      { x: '58%', y: '78%', color: '#ef5b8a', size: 12 },
    ],
    personX: '46%',
    personY: '62%',
  },
  {
    background: 'linear-gradient(180deg, #d7d2cb 0%, #8d8680 45%, #3a342f 100%)',
    holds: [
      { x: '30%', y: '16%', color: '#35a06a', size: 18 },
      { x: '72%', y: '32%', color: '#e44545', size: 14 },
      { x: '22%', y: '48%', color: '#f0c14a', size: 16 },
      { x: '64%', y: '60%', color: '#35a06a', size: 12 },
      { x: '40%', y: '78%', color: '#e44545', size: 18 },
    ],
    personX: '50%',
    personY: '50%',
  },
  {
    background: 'linear-gradient(160deg, #5f7d72 0%, #2d463f 42%, #14211d 100%)',
    holds: [
      { x: '64%', y: '18%', color: '#ffd36a', size: 16 },
      { x: '28%', y: '36%', color: '#ff8a5b', size: 18 },
      { x: '70%', y: '50%', color: '#8fd0ff', size: 14 },
      { x: '36%', y: '68%', color: '#ffd36a', size: 15 },
      { x: '62%', y: '80%', color: '#ff8a5b', size: 12 },
    ],
    personX: '42%',
    personY: '56%',
  },
]

export function WallThumb({ variant }: { variant: number }) {
  const wall = WALLS[variant % WALLS.length] ?? WALLS[0]
  return (
    <div className="wall" style={{ background: wall.background }} aria-hidden="true">
      {wall.holds.map((hold) => (
        <span
          key={`${hold.x}-${hold.y}`}
          className="wall-hold"
          style={{
            left: hold.x,
            top: hold.y,
            width: hold.size,
            height: hold.size * 0.82,
            background: hold.color,
          }}
        />
      ))}
      <svg className="wall-person" style={{ left: wall.personX, top: wall.personY }} viewBox="0 0 40 70">
        <circle cx="20" cy="8" r="5" fill="rgba(12,10,8,0.78)" />
        <path d="M20 14 L20 36 L10 52 M20 36 L32 50 M20 22 L8 30 M20 22 L33 16" stroke="rgba(12,10,8,0.78)" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      </svg>
      <span className="wall-shade" />
    </div>
  )
}
