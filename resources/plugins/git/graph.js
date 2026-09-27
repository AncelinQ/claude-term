// Commit graph layout (pure). Input: commits in topological order, each { hash, parents: [] }.
// Output per row: { node, color, up: [[x1, x2, color]], down: [[x1, x2, color]], width }
//   node   column of the commit dot
//   up     segments from the top edge (x1) to the row middle (x2)
//   down   segments from the row middle (x1) to the bottom edge (x2)
const PALETTE = 8

function layout(commits) {
  const lanes = []        // expected commit hash per column (null = free)
  const colors = []       // color per column
  let nextColor = 0
  const rows = []
  const free = () => { const i = lanes.indexOf(null); return i < 0 ? lanes.length : i }
  for (const c of commits) {
    let col = lanes.indexOf(c.hash)
    const tip = col < 0   // branch tip: nothing comes from above into the node
    if (tip) { col = free(); lanes[col] = c.hash; colors[col] = nextColor++ % PALETTE }
    const color = colors[col]
    // top half: every active lane comes in straight (a hash is awaited by one lane only: merges
    // join an existing lane instead of duplicating it, see below)
    const up = []
    for (let i = 0; i < lanes.length; i++) if (lanes[i] !== null && !(tip && i === col)) up.push([i, i, colors[i]])
    // bottom half: first parent continues the column, other parents open or join lanes
    const [first, ...others] = c.parents
    lanes[col] = first === undefined ? null : first
    const fromNode = []
    for (const p of others) {
      let j = lanes.indexOf(p)
      if (j < 0) { j = free(); lanes[j] = p; colors[j] = nextColor++ % PALETTE }
      fromNode.push(j)
    }
    // a first parent already awaited in another lane: join it there instead of duplicating the lane
    if (first !== undefined) {
      const k = lanes.findIndex((h, i) => i !== col && h === first)
      if (k >= 0) { lanes[col] = null; fromNode.push(k) }
    }
    const down = []
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === null) continue
      if (i === col) { down.push([col, col, color]); continue }
      if (up.some(([x1, x2]) => x1 === i && x2 === i)) down.push([i, i, colors[i]])   // lane passing through
      if (fromNode.includes(i)) down.push([col, i, colors[i]])                           // edge from the node to a parent lane
    }
    while (lanes.length && lanes[lanes.length - 1] === null) { lanes.pop(); colors.pop() }
    const width = Math.max(col + 1, ...up.map(([a, b]) => Math.max(a, b) + 1), ...down.map(([a, b]) => Math.max(a, b) + 1))
    rows.push({ node: col, color, up, down, width })
  }
  return rows
}

module.exports = { layout, PALETTE }
