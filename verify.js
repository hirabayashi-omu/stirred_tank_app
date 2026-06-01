const d = 0.1;
const rho = 1000;
const ks = 13.0;

// Power-law K=5.0, n=0.5
const params = { K: 5.0, n: 0.5 };
const activeModel = 'powerlaw';

function calcEffectiveViscosity(n_rps) {
    const gamma_eff = ks * n_rps;
    return params.K * Math.pow(gamma_eff, params.n - 1);
}

function calculateReVal(n_rps) {
    const mu_eff = calcEffectiveViscosity(n_rps);
    return (rho * n_rps * d * d) / mu_eff;
}

const test_n_rpm = [30, 60, 90, 120];
const theoretical_P = [0.0348, 0.0985, 0.1809, 0.2785];

test_n_rpm.forEach((rpm, idx) => {
    const n = rpm / 60;
    const P = theoretical_P[idx];
    const mu_a = calcEffectiveViscosity(n);
    const Re = calculateReVal(n);
    const Np = P / (rho * Math.pow(n, 3) * Math.pow(d, 5));
    console.log(`N=${rpm}rpm (${n}rps):`);
    console.log(`  mu_eff = ${mu_a.toFixed(4)} Pa.s`);
    console.log(`  Re = ${Re.toFixed(3)}`);
    console.log(`  Np = ${Np.toFixed(3)}`);
    console.log(`  Np * Re = ${(Np * Re).toFixed(3)}`);
});
