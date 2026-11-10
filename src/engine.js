// Баллистическое ядро — порт engine.py (шаг 2) на JavaScript.
// Модель материальной точки, G1/G7, атмосфера с градиентом по высоте,
// угол места, ветер, Кориолис, деривация (Литц), устойчивость (Миллер).
const Ballistics = (() => {
  const G1 = [[0,.2629],[.05,.2558],[.1,.2487],[.15,.2413],[.2,.2344],[.25,.2278],[.3,.2214],[.35,.2155],[.4,.2104],[.45,.2061],[.5,.2032],[.55,.202],[.6,.2034],[.7,.2165],[.725,.223],[.75,.2313],[.775,.2417],[.8,.2546],[.825,.2706],[.85,.2901],[.875,.3136],[.9,.3415],[.925,.3734],[.95,.4084],[.975,.4448],[1,.4805],[1.025,.5136],[1.05,.5427],[1.075,.5677],[1.1,.5883],[1.125,.6053],[1.15,.6191],[1.2,.6393],[1.25,.6518],[1.3,.6589],[1.35,.6621],[1.4,.6625],[1.45,.6607],[1.5,.6573],[1.55,.6528],[1.6,.6474],[1.65,.6413],[1.7,.6347],[1.75,.628],[1.8,.621],[1.85,.6141],[1.9,.6072],[1.95,.6003],[2,.5934],[2.05,.5867],[2.1,.5804],[2.15,.5743],[2.2,.5685],[2.25,.563],[2.3,.5577],[2.35,.5527],[2.4,.5481],[2.45,.5438],[2.5,.5397],[2.6,.5325],[2.7,.5264],[2.8,.5211],[2.9,.5168],[3,.5133],[3.1,.5105],[3.2,.5084],[3.3,.5067],[3.4,.5054],[3.5,.504],[3.6,.503],[3.7,.5022],[3.8,.5016],[3.9,.501],[4,.5006],[4.2,.4998],[4.4,.4995],[4.6,.4992],[4.8,.499],[5,.4988]];
  const G7 = [[0,.1198],[.05,.1197],[.1,.1196],[.15,.1194],[.2,.1193],[.25,.1194],[.3,.1194],[.35,.1194],[.4,.1193],[.45,.1193],[.5,.1194],[.55,.1193],[.6,.1194],[.65,.1197],[.7,.1202],[.725,.1207],[.75,.1215],[.775,.1226],[.8,.1242],[.825,.1266],[.85,.1306],[.875,.1368],[.9,.1464],[.925,.166],[.95,.2054],[.975,.2993],[1,.3803],[1.025,.4015],[1.05,.4043],[1.075,.4034],[1.1,.4014],[1.125,.3987],[1.15,.3955],[1.2,.3884],[1.25,.381],[1.3,.3732],[1.35,.3657],[1.4,.358],[1.5,.344],[1.55,.3376],[1.6,.3315],[1.65,.326],[1.7,.3209],[1.75,.316],[1.8,.3117],[1.85,.3078],[1.9,.3042],[1.95,.301],[2,.298],[2.05,.2951],[2.1,.2922],[2.15,.2892],[2.2,.2864],[2.25,.2835],[2.3,.2807],[2.35,.2779],[2.4,.2752],[2.45,.2725],[2.5,.2697],[2.55,.267],[2.6,.2643],[2.65,.2615],[2.7,.2588],[2.75,.2561],[2.8,.2533],[2.85,.2506],[2.9,.2479],[2.95,.2451],[3,.2424],[3.1,.2368],[3.2,.2313],[3.3,.2258],[3.4,.2205],[3.5,.2154],[3.6,.2106],[3.7,.206],[3.8,.2017],[3.9,.1975],[4,.1935],[4.2,.1861],[4.4,.1793],[4.6,.173],[4.8,.1672],[5,.1618]];
  const TABLES = { G1, G7 };
  const GRAV = 9.80665, OMEGA = 7.292115e-5, LB_IN2 = 703.0696;

  function cd(mach, t) {
    if (mach <= t[0][0]) return t[0][1];
    if (mach >= t[t.length - 1][0]) return t[t.length - 1][1];
    let lo = 0, hi = t.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m][0] <= mach) lo = m; else hi = m; }
    const [m0, c0] = t[lo], [m1, c1] = t[hi];
    return c0 + (c1 - c0) * (mach - m0) / (m1 - m0);
  }

  // atmo: {temp, pressureHpa, humidity, powderTemp|null}
  function density(a) {
    const tk = a.temp + 273.15;
    const psat = 610.94 * Math.exp(17.625 * a.temp / (a.temp + 243.04));
    const pv = a.humidity / 100 * psat;
    const pd = a.pressureHpa * 100 - pv;
    return pd / (287.058 * tk) + pv / (461.495 * tk);
  }
  const soundSpeed = a => 331.3 * Math.sqrt(1 + a.temp / 273.15);
  const powderT = a => (a.powderTemp == null ? a.temp : a.powderTemp);

  function velocityAt(load, ptemp) { return load.v0 + load.powderSens * (ptemp - load.powderRefTemp); }

  // bullet: {bc, model, massG, diaMm, lenMm}; rifle: {sightCm, twistIn, twistRight, zeroM}
  function stability(bullet, rifle, v0, a) {
    const d = bullet.diaMm / 25.4, l = (bullet.lenMm / 25.4) / d, t = rifle.twistIn / d, m = bullet.massG * 15.4324;
    let sg = 30 * m / (t * t * d ** 3 * l * (1 + l * l));
    sg *= Math.cbrt(v0 / 0.3048 / 2800);
    const tf = a.temp * 9 / 5 + 32, pin = a.pressureHpa * 0.02953;
    return sg * ((tf + 460) / 519) * (29.92 / pin);
  }
  const spinDrift = (sg, tof, right) => tof <= 0 ? 0 : 1.25 * (sg + 1.2) * tof ** 1.83 * 0.0254 * (right ? 1 : -1);

  // shot: {lookDeg, windMs, windClock, lat|null, azDeg}
  function integrate(v0, elev, bullet, a, shot, sightH, maxRange, step, useWind = true, useCor = true, dt = 0.0005) {
    const table = TABLES[bullet.model];
    const kAir = 0.5 * density(a) * (Math.PI / 4) / LB_IN2;
    // ступенчатый BC (так его публикует Sierra): [[нижняя граница скорости, м/с, BC], ...] по убыванию скорости
    const steps = bullet.bcSteps;
    const bcAt = steps ? (v => { for (const st of steps) if (v >= st[0]) return st[1]; return steps[steps.length - 1][1]; }) : (() => bullet.bc);
    const t0 = a.temp + 273.15, c0 = soundSpeed(a);
    let wx = 0, wz = 0;
    if (useWind && shot.windMs) {
      const ang = shot.windClock * 30 * Math.PI / 180;
      wx = -shot.windMs * Math.cos(ang); wz = -shot.windMs * Math.sin(ang);
    }
    let ox = 0, oy = 0, oz = 0;
    if (useCor && shot.lat != null) {
      const la = shot.lat * Math.PI / 180, az = shot.azDeg * Math.PI / 180;
      ox = OMEGA * Math.cos(la) * Math.cos(az); oy = OMEGA * Math.sin(la); oz = -OMEGA * Math.cos(la) * Math.sin(az);
    }
    const out = new Float64Array(6);
    function deriv(s, o) {
      const vx = s[3], vy = s[4], vz = s[5];
      const rx = vx - wx, ry = vy, rz = vz - wz;
      const vr = Math.sqrt(rx * rx + ry * ry + rz * rz);
      const ratio = (t0 - 0.0065 * s[1]) / t0;
      const k = kAir / bcAt(vr) * ratio ** 4.2559, c = c0 * Math.sqrt(ratio);
      const f = k * cd(vr / c, table) * vr;
      o[0] = vx; o[1] = vy; o[2] = vz;
      o[3] = -f * rx - 2 * (oy * vz - oz * vy);
      o[4] = -f * ry - GRAV - 2 * (oz * vx - ox * vz);
      o[5] = -f * rz - 2 * (ox * vy - oy * vx);
    }
    const th = shot.lookDeg * Math.PI / 180;
    const lx = Math.cos(th), ly = Math.sin(th), nx = -Math.sin(th), ny = Math.cos(th);
    const sx = sightH * nx, sy = sightH * ny;
    const along = s => (s[0] - sx) * lx + (s[1] - sy) * ly;
    const up = s => (s[0] - sx) * nx + (s[1] - sy) * ny;

    const L = th + elev;
    let s = [0, 0, 0, v0 * Math.cos(L), v0 * Math.sin(L), 0], t = 0;
    let ps = s.slice(), pt = 0;
    const k1 = new Float64Array(6), k2 = new Float64Array(6), k3 = new Float64Array(6), k4 = new Float64Array(6), tmp = new Array(6);
    const pts = []; let next = 0;
    while (true) {
      const al = along(s);
      while (al >= next && next <= maxRange + 1e-9) {
        const pa = along(ps);
        let f = al === pa ? 0 : (next - pa) / (al - pa); f = Math.min(Math.max(f, 0), 1);
        const si = ps.map((p, i) => p + f * (s[i] - p));
        pts.push({ range: next, up: up(si), side: si[2], t: pt + f * (t - pt), v: Math.hypot(si[3], si[4], si[5]) });
        next += step;
      }
      if (next > maxRange + 1e-9 || s[3] < 30 || t > 30) break;
      ps = s; pt = t;
      deriv(s, k1);
      for (let i = 0; i < 6; i++) tmp[i] = s[i] + 0.5 * dt * k1[i]; deriv(tmp, k2);
      for (let i = 0; i < 6; i++) tmp[i] = s[i] + 0.5 * dt * k2[i]; deriv(tmp, k3);
      for (let i = 0; i < 6; i++) tmp[i] = s[i] + dt * k3[i]; deriv(tmp, k4);
      s = s.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      t += dt;
    }
    return pts;
  }

  function zeroElevation(load, rifle, za) {
    const v0 = velocityAt(load, powderT(za)), sh = rifle.sightCm / 100;
    const flat = { lookDeg: 0, windMs: 0, windClock: 3, lat: null, azDeg: 0 };
    let lo = -0.005, hi = 0.05;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const p = integrate(v0, mid, load.bullet, za, flat, sh, rifle.zeroM, rifle.zeroM, false, false);
      const u = p.length > 1 ? p[p.length - 1].up : -1;
      if (u < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  const angUnits = (m, d, units) => d <= 0 ? 0 : (units === 'MRAD' ? Math.atan2(m, d) * 1000 : Math.atan2(m, d) * 180 / Math.PI * 60);

  // Главная функция. Возвращает строки с поправками.
  // zeroLoad — патрон, которым пристрелян прицел (если стреляем другим патроном).
  function solve(load, rifle, atmo, shot, maxRange, step, zeroAtmo, zeroLoad) {
    const elev = zeroElevation(zeroLoad || load, rifle, zeroAtmo || atmo);
    const v0 = velocityAt(load, powderT(atmo));
    const sg = stability(load.bullet, rifle, v0, atmo);
    const c = soundSpeed(atmo);
    const pts = integrate(v0, elev, load.bullet, atmo, shot, rifle.sightCm / 100, maxRange, step);
    const rows = [];
    for (const p of pts) {
      if (p.range === 0) continue;
      const sd = spinDrift(sg, p.t, rifle.twistRight);
      const side = p.side + sd;
      const dA = angUnits(p.up, p.range, rifle.units), wA = angUnits(side, p.range, rifle.units);
      rows.push({
        range: p.range, dropCm: p.up * 100, dropAng: dA, dropClicks: -dA / rifle.click,
        sideCm: side * 100, spinCm: sd * 100, sideAng: wA, sideClicks: -wA / rifle.click,
        v: p.v, mach: p.v / c, energy: 0.5 * load.bullet.massG / 1000 * p.v * p.v, t: p.t,
      });
    }
    return { rows, info: { v0, sg, density: density(atmo), sound: c } };
  }

  return { solve, stability, density, velocityAt };
})();
if (typeof module !== 'undefined') module.exports = Ballistics;
