// Core Agitator Simulation and Data Plotting script

// State Management
let config = {
    expNumber: 'EXP-001',
    expDate: '',
    expAuthor: '攻拈 太郎',
    g: 9.806,
    liquidTemp: 25,
    rho: 998,
    mu: 0.417,
    V_act: 0.7295,
    DT: 0.105,
    H: 0.093,
    headType: 'semi-elliptical',
    impellerType: 'pitched-paddle',
    np: 4,
    theta: 45,
    d: 0.060,
    b: 0.020,
    clearance: 0.020,
    n_stage: 1,
    baffleActive: true,
    nB: 1,
    Bw: 0.014,
    dp_um: 150,
    rho_S: 2500,
    solidConcMode: 'wt-ratio',
    solidConcVal: 1.0,
    sFactorMode: 'auto',
    sFactorCustom: 5.0,
    simSpeed: 300,
    simSpeedSync: true,
    activeTab: 'rushton',
    solidLiquidActive: true
};

// Rheology model state (loaded from viscometer CSV)
let rheologyData = {
    samples: {},         // { sampleName: [ { modelId, name, rating, r2, rmse, mae, params:{} } ] }
    activeSample: null,
    activeModel: 'newtonian',
    ks: 11.5
};

let expBlocks = [];
let chart = null;

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadPresetList();

    // Attempt to load saved state from localStorage
    const savedState = localStorage.getItem('agitator_current_state');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            if (parsed.config) {
                config = { ...config, ...parsed.config };
            }
            
            if (parsed.rheologyData) {
                rheologyData = parsed.rheologyData;
            }

            initInputs();
            updateRheologyUI();
            
            if (parsed.expBlocks && parsed.expBlocks.length > 0) {
                expBlocks = [];
                document.getElementById('blocks-container').innerHTML = '';
                parsed.expBlocks.forEach(block => {
                    expBlocks.push(block);
                    renderBlockHTML(block);
                    recalculateBlock(block.id);
                });
            } else {
                addBlock({ name: '300 rpm 条件', N_default: 300 });
            }
        } catch (e) {
            console.error("Failed to load saved state", e);
            initInputs();
            addBlock({ name: '300 rpm 条件', N_default: 300 });
        }
    } else {
        initInputs();
        addBlock({ name: '300 rpm 条件', N_default: 300 });
    }

    recalculateAll();
    switchMainTab(config.activeTab || 'rushton');
    feather.replace();
});

// Bind UI inputs to State
function initInputs() {
    // Set default date to today if empty
    if (!config.expDate) {
        const today = new Date().toISOString().split('T')[0];
        config.expDate = today;
    }

    // Load config state to inputs
    document.getElementById('exp-number').value = config.expNumber;
    document.getElementById('exp-date').value = config.expDate;
    document.getElementById('exp-author').value = config.expAuthor;
    document.getElementById('g').value = config.g;
    document.getElementById('liquid-temp').value = config.liquidTemp;
    document.getElementById('rho').value = config.rho;
    document.getElementById('mu').value = config.mu;
    document.getElementById('V-act').value = config.V_act ?? 0;
    document.getElementById('DT').value = config.DT;
    document.getElementById('H').value = config.H;
    document.getElementById('head-type').value = config.headType;
    document.getElementById('impeller-type').value = config.impellerType;
    document.getElementById('np').value = config.np;
    document.getElementById('theta').value = config.theta;
    document.getElementById('d').value = config.d;
    document.getElementById('b').value = config.b;
    document.getElementById('clearance').value = config.clearance;
    document.getElementById('n_stage').value = config.n_stage;
    document.getElementById('baffle-active').checked = config.baffleActive;
    document.getElementById('nB').value = config.nB;
    document.getElementById('Bw').value = config.Bw;

    toggleBaffleInputs();

    // 羽根角度 θ の初期ロック状態反映
    const isFlat = config.impellerType === 'flat-paddle' || config.impellerType === 'flat-turbine';
    const thetaInput = document.getElementById('theta');
    if (thetaInput) {
        thetaInput.disabled = isFlat;
        if (isFlat) {
            thetaInput.value = 90;
            config.theta = 90;
        }
    }

    // 粒子・固液撹拌データのロード
    document.getElementById('solid-liquid-active').checked = config.solidLiquidActive ?? true;
    document.getElementById('dp-um').value = config.dp_um ?? 150;
    document.getElementById('rho-S').value = config.rho_S ?? 2500;
    document.getElementById('solid-conc-mode').value = config.solidConcMode ?? 'wt-ratio';
    document.getElementById('solid-conc-val').value = config.solidConcVal ?? 1.0;
    document.getElementById('s-factor-mode').value = config.sFactorMode ?? 'auto';
    document.getElementById('s-factor-custom').value = config.sFactorCustom ?? 5.0;
    
    const cModel = document.getElementById('cavern-model');
    if (cModel) cModel.value = config.cavernModel ?? 'spherical';
    
    const simSpeed = config.simSpeed ?? 300;
    document.getElementById('sim-speed-slider').value = simSpeed;
    document.getElementById('sim-speed-val').textContent = simSpeed;
    document.getElementById('sim-speed-sync').checked = config.simSpeedSync ?? true;

    updateSolidConcLabel();
    toggleSFactorCustom();
    toggleSolidLiquidInputs();
}

function initEventListeners() {
    initRheologyListeners();
    // Watch sidebar input changes
    const metaInputs = ['exp-number', 'exp-date', 'exp-author'];
    metaInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            const key = id.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            config[key] = e.target.value;
            saveCurrentState();
        });
    });

    const inputs = [
        'g', 'liquid-temp', 'rho', 'mu', 'V-act', 'DT', 'H', 'head-type',
        'impeller-type', 'np', 'theta', 'd', 'b', 'clearance',
        'n_stage', 'nB', 'Bw'
    ];

    const getPropName = (id) => {
        if (id === 'liquid-temp') return 'liquidTemp';
        if (id === 'head-type') return 'headType';
        if (id === 'impeller-type') return 'impellerType';
        if (id === 'V-act') return 'V_act';
        return id;
    };

    inputs.forEach(id => {
        document.getElementById(id).addEventListener('input', (e) => {
            let val = e.target.value;
            if (e.target.type === 'number') {
                val = parseFloat(val) || 0;
            }
            if (id === 'np') {
                let parsed = parseInt(val) || 2;
                if (parsed < 2) {
                    parsed = 2;
                    e.target.value = 2;
                }
                val = parsed;
            }
            config[getPropName(id)] = val;
            
            // インペラ種類変更時にks値を自動セット
            if (id === 'impeller-type') {
                const presetMap = {
                    'pitched-paddle': 8.5,
                    'flat-paddle': 11.0,
                    'flat-turbine': 11.5,
                    'propeller': 10.0,
                    'faudler': 11.5
                };
                if (presetMap[val]) {
                    rheologyData.ks = presetMap[val];
                    const ksInput = document.getElementById('ks-input');
                    if (ksInput) ksInput.value = presetMap[val].toFixed(1);
                    if (typeof updateRheologyUI === 'function') updateRheologyUI();
                    showToast(`インペラ種類に合わせて kₛ を ${presetMap[val].toFixed(1)} に設定しました`, 'info');
                }

                // 羽根角度 θ の自動ロック（フラット翼の場合は90度に固定して無効化）
                const thetaInput = document.getElementById('theta');
                if (thetaInput) {
                    if (val === 'flat-paddle' || val === 'flat-turbine') {
                        thetaInput.value = 90;
                        thetaInput.disabled = true;
                        config.theta = 90;
                    } else {
                        thetaInput.disabled = false;
                        if (parseFloat(thetaInput.value) === 90) {
                            thetaInput.value = 45;
                            config.theta = 45;
                        }
                    }
                }
            }
            
            recalculateAll();
        });
    });

    document.getElementById('baffle-active').addEventListener('change', (e) => {
        config.baffleActive = e.target.checked;
        toggleBaffleInputs();
        recalculateAll();
    });

    // Control buttons
    document.getElementById('add-block-btn').addEventListener('click', () => {
        const userInput = prompt("追加する測定ブロックの初期回転数 N (rpm) を入力してください:", "300");
        if (userInput === null) return; // Cancelled
        
        const rpmVal = parseInt(userInput);
        if (isNaN(rpmVal) || rpmVal <= 0) {
            showToast('無効な回転数が入力されました。', 'error');
            return;
        }
        
        addBlock({ name: `測定ブロック (N = ${rpmVal} rpm)`, N_default: rpmVal });
        showToast(`N = ${rpmVal} rpm の測定ブロックを追加しました。`, 'success');
    });

    document.getElementById('load-sample-btn').addEventListener('click', loadSampleData);
    document.getElementById('export-pdf-btn').addEventListener('click', generatePDFReport);
    document.getElementById('export-csv-btn').addEventListener('click', exportCSV);
    document.getElementById('csv-file-input').addEventListener('change', importCSV);

    // Chart Y limit adjusters
    document.getElementById('chart-ymin').addEventListener('change', (e) => {
        if (chart) {
            const val = e.target.value;
            chart.options.scales.y.min = val === 'auto' ? undefined : parseFloat(val);
            chart.update();
        }
    });

    document.getElementById('chart-ymax').addEventListener('change', (e) => {
        if (chart) {
            const val = e.target.value;
            chart.options.scales.y.max = val === 'auto' ? undefined : parseFloat(val);
            chart.update();
        }
    });

    // Preset management event listeners
    const presetSelect = document.getElementById('preset-select');
    const loadPresetBtn = document.getElementById('load-preset-btn');
    const deletePresetBtn = document.getElementById('delete-preset-btn');

    presetSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        loadPresetBtn.disabled = !val;
        deletePresetBtn.disabled = !val;
    });

    document.getElementById('save-preset-btn').addEventListener('click', () => {
        const name = prompt("プリセット名を入力してください:");
        if (name === null) return;
        const trimmed = name.trim();
        if (!trimmed) {
            showToast('プリセット名を入力してください。', 'error');
            return;
        }
        savePreset(trimmed);
    });

    loadPresetBtn.addEventListener('click', () => {
        const val = presetSelect.value;
        if (val) {
            loadPreset(val);
        }
    });

    deletePresetBtn.addEventListener('click', () => {
        const val = presetSelect.value;
        if (val && confirm(`プリセット "${val}" を削除してもよろしいですか？`)) {
            deletePreset(val);
        }
    });

    // 粒子・固液撹拌シミュレータ関連のイベントリスナ追加
    document.getElementById('solid-liquid-active').addEventListener('change', (e) => {
        config.solidLiquidActive = e.target.checked;
        toggleSolidLiquidInputs();
        recalculateAll();
    });

    document.getElementById('dp-um').addEventListener('input', (e) => {
        config.dp_um = parseFloat(e.target.value) || 150;
        recalculateAll();
    });
    document.getElementById('rho-S').addEventListener('input', (e) => {
        config.rho_S = parseFloat(e.target.value) || 2500;
        recalculateAll();
    });
    document.getElementById('solid-conc-mode').addEventListener('change', (e) => {
        config.solidConcMode = e.target.value;
        updateSolidConcLabel();
        recalculateAll();
    });
    document.getElementById('solid-conc-val').addEventListener('input', (e) => {
        config.solidConcVal = parseFloat(e.target.value) || 1.0;
        recalculateAll();
    });
    document.getElementById('s-factor-mode').addEventListener('change', (e) => {
        config.sFactorMode = e.target.value;
        toggleSFactorCustom();
        recalculateAll();
    });
    document.getElementById('s-factor-custom').addEventListener('input', (e) => {
        config.sFactorCustom = parseFloat(e.target.value) || 5.0;
        recalculateAll();
    });
    document.getElementById('sim-speed-slider').addEventListener('input', (e) => {
        config.simSpeed = parseFloat(e.target.value) || 0;
        document.getElementById('sim-speed-val').textContent = config.simSpeed;
        
        // スライダーを手動で動かしたら自動同期を解除
        if (config.simSpeedSync) {
            config.simSpeedSync = false;
            document.getElementById('sim-speed-sync').checked = false;
        }
        updateSimulatorResultsOnly();
        saveCurrentState(); // 同期用に追加
    });
    document.getElementById('sim-speed-sync').addEventListener('change', (e) => {
        config.simSpeedSync = e.target.checked;
        if (config.simSpeedSync) {
            syncSimulatorSpeedWithBlock();
        }
        recalculateAll();
    });
    document.getElementById('btn-set-njs').addEventListener('click', () => {
        const njs_rpm_str = document.getElementById('sim-res-Njs-rpm').textContent;
        const njs_rpm = parseFloat(njs_rpm_str);
        if (!isNaN(njs_rpm) && njs_rpm > 0) {
            config.simSpeed = Math.round(njs_rpm);
            document.getElementById('sim-speed-slider').value = config.simSpeed;
            document.getElementById('sim-speed-val').textContent = config.simSpeed;
            config.simSpeedSync = false;
            document.getElementById('sim-speed-sync').checked = false;
            updateSimulatorResultsOnly();
            saveCurrentState(); // 同期用に追加
            showToast(`シミュレーション回転数を Njs (${config.simSpeed} rpm) に設定しました`, 'success');
        }
    });

    // Tab switching event listeners
    const tabRushton = document.getElementById('tab-btn-rushton');
    const tabPartsim = document.getElementById('tab-btn-partsim');
    if (tabRushton && tabPartsim) {
        tabRushton.addEventListener('click', () => switchMainTab('rushton'));
        tabPartsim.addEventListener('click', () => switchMainTab('partsim'));
    }
}

function toggleBaffleInputs() {
    const active = config.baffleActive;
    const nBContainer = document.getElementById('nB-container');
    const BwContainer = document.getElementById('Bw-container');
    if (nBContainer && BwContainer) {
        nBContainer.style.display = active ? 'flex' : 'none';
        BwContainer.style.display = active ? 'flex' : 'none';
    }
}

function toggleSolidLiquidInputs() {
    const active = config.solidLiquidActive;
    
    // Toggle container elements visibility
    const ids = [
        'dp-um-container',
        'rho-S-container',
        'solid-conc-mode-container',
        'solid-conc-val-container',
        's-factor-mode-container'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = active ? 'flex' : 'none';
    });
    
    // Custom S factor container visibility
    toggleSFactorCustom();

    // Toggle Tab Button visibility
    const tabBtn = document.getElementById('tab-btn-partsim');
    if (tabBtn) {
        tabBtn.style.display = active ? 'flex' : 'none';
    }

    // If solid-liquid system is deactivated and active tab was 'partsim', switch to 'rushton'
    if (!active && config.activeTab === 'partsim') {
        switchMainTab('rushton');
    }
}

// Show feedback message
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.className = `toast show ${type}`;
    toast.textContent = message;
    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// ----------------------------------------------------
// Mathematical Core: Kamei-Hiraoka-Kato Correlations
// ----------------------------------------------------

function getKameiHiraokaIntermediateVars() {
    const { DT, d, np, b, H, theta, impellerType } = config;
    const D_d = DT / d;
    const d_D = d / DT;
    const thetaRad = (theta * Math.PI) / 180;

    const beta = (2 * Math.log(D_d)) / (D_d - d_D);
    
    // np in log term instead of eta (Self-consistent bug correction)
    const etaNumerator = 0.711 * (0.157 + Math.pow(np * Math.log(D_d), 0.611));
    const etaDenominator = Math.pow(np, 0.52) * (1 - Math.pow(d_D, 2));
    const eta = etaNumerator / etaDenominator;

    const gamma = Math.pow((eta * Math.log(D_d)) / Math.pow(beta * D_d, 5), 1 / 3);
    const X = (gamma * Math.pow(np, 0.7) * b * Math.pow(Math.sin(thetaRad), 1.6)) / H;

    // 加藤らの修正式（プロペラ・ファウドラー用）とパドル用の条件切り替え
    let Ct_coef = 1.96;
    let Ct_exp = 1.19;
    let m_coef = 0.71;

    if (impellerType === 'propeller' || impellerType === 'faudler') {
        Ct_coef = 3.0;
        Ct_exp = 1.5;
        m_coef = 0.8;
    }

    const Ct = Math.pow(Math.pow(Ct_coef * Math.pow(X, Ct_exp), -7.8) + Math.pow(0.25, -7.8), -1 / 7.8);
    const m = Math.pow(Math.pow(m_coef * Math.pow(X, 0.373), -7.8) + Math.pow(0.333, -7.8), -1 / 7.8);
    const Cu = 23.8 * Math.pow(d_D, -3.24) * Math.pow((b * Math.sin(thetaRad)) / DT, -1.18) * Math.pow(X, -0.74);
    const f_infty = 0.0151 * d_D * Math.pow(Ct, 0.308);

    const term1_CL = 0.215 * eta * np * (d / H) * (1 - Math.pow(d_D, 2));
    const term2_CL = 1.83 * ((b * Math.sin(thetaRad)) / H) * Math.pow(np / (2 * Math.sin(thetaRad)), 1 / 3);
    const CL = term1_CL + term2_CL;

    const ReG_ratio = (Math.PI * eta * Math.log(D_d)) / (4 * d / (beta * DT));

    const NpMax = getNpMax();

    return {
        beta, eta, gamma, X, Ct, m, Cu, f_infty, CL, ReG_ratio, NpMax
    };
}

// Calculate liquid volume based on dish head shape
// H = height from deepest point of bottom to liquid surface
function calcLiquidVolume() {
    const R = config.DT / 2;
    const H = config.H;
    const headType = config.headType;

    let h_dish = 0; // depth of bottom dish
    let V_dish = 0; // volume of bottom dish portion

    if (headType === 'semi-elliptical') {
        // 2:1 semi-ellipsoidal: depth = R/2
        h_dish = R / 2;
        V_dish = Math.PI * R * R * R / 3; // (2/3)*pi*R^2*(R/2)
    } else if (headType === 'dish') {
        // Torispherical (dish): depth ≈ 0.1935 * DT (standard ratio)
        h_dish = 0.1935 * config.DT;
        // Volume approximation for torispherical head: V ≈ 0.084 * pi * DT^3
        V_dish = 0.084 * Math.PI * Math.pow(config.DT, 3);
    } else if (headType === 'hemispherical') {
        // Full hemisphere: depth = R
        h_dish = R;
        V_dish = (2 / 3) * Math.PI * R * R * R;
    } else {
        // Flat bottom: no dish volume
        h_dish = 0;
        V_dish = 0;
    }

    // Cylindrical section filled with liquid
    const h_cyl = Math.max(0, H - h_dish);
    const V_cyl = Math.PI * R * R * h_cyl;

    // If liquid height is less than dish depth, calculate partial dish fill
    if (H <= h_dish && h_dish > 0) {
        // Partial fill of ellipsoidal/hemispherical/dish bottom
        // Use spheroidal cap approximation: V = pi*H^2*(3*a - H)/3 where a = h_dish
        // For ellipsoid with semi-axes R, R, h_dish:
        // V(z) = pi*R^2/h_dish^2 * (h_dish*H^2/2 - H^3/3)
        //       = pi*R^2*H^2/(h_dish^2) * (h_dish/2 - H/3)
        if (headType === 'hemispherical') {
            return Math.PI * H * H * (3 * R - H) / 3;
        } else if (headType === 'semi-elliptical') {
            // Corrected formula: V(H) = pi*(R^2/h_dish^2)*(h_dish*H^2 - H^3/3)
            return (Math.PI * R * R / (h_dish * h_dish)) * (h_dish * H * H - Math.pow(H, 3) / 3);
        } else {
            // dish: approximate linearly
            return V_dish * (H / h_dish);
        }
    }

    return V_dish + V_cyl;
}

// Return the liquid volume to use for Pv calculation:
// If V_act (measured, in L) > 0, use it (converted from L to m³).
// Otherwise, fall back to the dish-shape-corrected estimate.
function calcLiquidVolumeForPv() {
    if (config.V_act && config.V_act > 0) {
        return config.V_act * 1e-3; // L → m³
    }
    return calcLiquidVolume();
}

// Calculate NpMax based on impeller type and multi-stage configuration
function getNpMax() {
    const { impellerType, np, b, d, theta, n_stage } = config;
    const thetaRad = (theta * Math.PI) / 180;
    let NpMax_1 = 0; // 1-stage NpMax

    if (impellerType === 'flat-paddle' || impellerType === 'flat-turbine') {
        const val = Math.pow(np, 0.7) * (b / d);
        if (val <= 0.54) {
            NpMax_1 = 10 * Math.pow(val, 1.3);
        } else if (val <= 1.6) {
            NpMax_1 = 8.3 * val;
        } else {
            NpMax_1 = 10 * Math.pow(val, 0.6);
        }
    } else if (impellerType === 'pitched-paddle') {
        NpMax_1 = 8.3 * Math.pow((2 * thetaRad) / Math.PI, 0.9) * (Math.pow(np, 0.7) * b * Math.pow(Math.sin(thetaRad), 1.6) / d);
    } else if (impellerType === 'propeller' || impellerType === 'faudler') {
        NpMax_1 = 6.5 * Math.pow(Math.pow(np, 0.7) * b * Math.pow(Math.sin(thetaRad), 1.6) / d, 1.7);
    }

    return NpMax_1 * n_stage;
}

// Calculate Np0 (unbaffled) and Np (baffled) for a given Reynolds number
function calculateNpCurve(Re) {
    if (Re <= 0) return { Np0: 0, Np: 0 };
    
    const vars = getKameiHiraokaIntermediateVars();
    const { beta, Cu, CL, Ct, m, f_infty, ReG_ratio, NpMax } = vars;
    const { d, DT, H, theta, baffleActive, nB, Bw, impellerType } = config;

    const ReG = ReG_ratio * Re;

    const Cu_ReG = Cu / ReG;
    const bracketTerm = Math.pow(Cu_ReG + ReG, -1);
    const f_ratio_term = Math.pow(f_infty / Ct, 1 / m);
    
    const f = CL / ReG + Ct * Math.pow(bracketTerm + f_ratio_term, m);

    // Unbaffled Power number Np0
    const volume_factor = 8 * Math.pow(d, 3) / (Math.pow(DT, 2) * H);
    const Np0 = (1.2 * Math.pow(Math.PI, 4) * Math.pow(beta, 2) / volume_factor) * f * config.n_stage;

    // Baffled Power number (Kamei Equation)
    if (!baffleActive || nB <= 0 || Bw <= 0) {
        return { Np0, Np: Np0 };
    }

    const thetaRad = (theta * Math.PI) / 180;
    let x = 0;

    if (impellerType === 'flat-paddle' || impellerType === 'flat-turbine') {
        x = (4.5 * (Bw / DT) * Math.pow(nB, 0.8)) / Math.pow(NpMax, 0.2) + (Np0 / NpMax);
    } else {
        const thetaTerm = Math.pow((2 * thetaRad) / Math.PI, 0.72);
        x = (4.5 * (Bw / DT) * Math.pow(nB, 0.8)) / (thetaTerm * Math.pow(NpMax, 0.2)) + (Np0 / NpMax);
    }

    let Np = Math.pow(1 + Math.pow(x, -3), -1 / 3) * NpMax;

    // 学術的ルール: 算出された Np が Np0 より小さい場合は Np0 を採用する（層流域での物理的整合性を維持）
    if (Np < Np0) {
        Np = Np0;
    }

    return { Np0, Np };
}

// ----------------------------------------------------
// UI Logic & Recalculations
// ----------------------------------------------------

function recalculateAll() {
    updateIntermediateVarsUI();
    recalculateExperimentalData();
    
    // 同期設定が有効な場合、最初の測定ブロックの回転数に同期
    if (config.simSpeedSync) {
        syncSimulatorSpeedWithBlock();
    }
    
    updateChart();
    updateLowReWarning();
    updateSimulatorResults();
    saveCurrentState();
}

function updateIntermediateVarsUI() {
    const vars = getKameiHiraokaIntermediateVars();
    const { beta, eta, gamma, X, Ct, m, Cu, f_infty, CL, ReG_ratio, NpMax } = vars;

    const rows = [
        { name: 'β (ベータ)', def: '2ln(D/d) / (D/d - d/D)', val: beta },
        { name: 'η (イータ)', def: '翼付近の循環流量比に関するパラメータ', val: eta },
        { name: 'γ (ガンマ)', def: '流動モデルにおけるせん断幅の係数', val: gamma },
        { name: 'X', def: '動力相関変数', val: X },
        { name: 'Ct', def: '乱流時の形状項係数', val: Ct },
        { name: 'm', def: '遷移域補正指数', val: m },
        { name: 'Cu', def: '層流渦抵抗係数', val: Cu },
        { name: 'f_∞', def: '極限摩擦係数', val: f_infty },
        { name: 'CL', def: '層流抵抗の形状係数', val: CL },
        { name: 'ReG / Re', def: '流動モデルにおけるレイノルズ数比', val: ReG_ratio },
        { name: 'NpMax (段数補正済)', def: '完全邪魔板条件での最大動力数', val: NpMax }
    ];

    const tbody = document.getElementById('calculated-vars-body');
    tbody.innerHTML = '';

    rows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${r.name}</strong></td>
            <td class="text-secondary" style="font-size:0.75rem;">${r.def}</td>
            <td class="calculated-cell highlight-blue">${r.val.toFixed(5)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// Dynamic Experimental Blocks Management
function addBlock(opts = {}) {
    const blockId = 'block-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const N_val = opts.N_default || 300;
    
    const block = {
        id: blockId,
        name: opts.name || `測定ブロック (N = ${N_val} rpm)`,
        rows: []
    };

    // Default 7 rows (time 0 to 60s)
    const times = [0, 10, 20, 30, 40, 50, 60];
    times.forEach(t => {
        block.rows.push({
            time: t,
            N: N_val,
            T: opts.T_default || 0,
            Tb: opts.Tb_default || 0
        });
    });

    expBlocks.push(block);
    renderBlockHTML(block);
    recalculateBlock(blockId);
}

function removeBlock(blockId) {
    expBlocks = expBlocks.filter(b => b.id !== blockId);
    const el = document.getElementById(blockId);
    if (el) el.remove();
    recalculateAll();
}

function renderBlockHTML(block) {
    const container = document.getElementById('blocks-container');
    const blockEl = document.createElement('div');
    blockEl.className = 'block-card';
    blockEl.id = block.id;
    
    let rowsHTML = '';
    block.rows.forEach((row, idx) => {
        rowsHTML += createRowHTML(row, idx, block.id);
    });

    blockEl.innerHTML = `
        <div class="block-header">
            <div class="block-header-info">
                <h4>
                    <i data-feather="box" style="width:16px;height:16px;vertical-align:middle;margin-right:6px;color:var(--accent-color);"></i>
                    <input type="text" value="${block.name}" oninput="updateBlockName('${block.id}', this.value)" class="block-title-input">
                </h4>
                <div class="block-meta">
                    <span id="${block.id}-meta-re">Re: -</span>
                    <span id="${block.id}-meta-np">Np: -</span>
                    <span id="${block.id}-meta-fr">Fr: -</span>
                </div>
            </div>
            <div class="block-actions">
                <button class="btn btn-secondary" onclick="addEmptyRow('${block.id}')">
                    <i data-feather="plus"></i> 行追加
                </button>
                <button class="btn btn-secondary" style="color:var(--danger-color);border-color:rgba(239, 68, 68, 0.2);" onclick="removeBlock('${block.id}')">
                    <i data-feather="trash-2"></i> ブロック削除
                </button>
            </div>
        </div>
        <div class="data-table-container">
            <table class="data-table">
                <thead>
                    <tr>
                        <th width="80">時間 θ (s)</th>
                        <th>回転数 N (rpm)</th>
                        <th>回転数 n (1/s)</th>
                        <th>トルク T (実測) (N·m)</th>
                        <th>トルク Tb (ブランク) (N·m)</th>
                        <th>攪拌所要動力 P (W)</th>
                        <th>正味動力 Pv (W/m³)</th>
                        <th class="col-mu-eff">μ_eff (Pa·s)</th>
                        <th>レイノルズ数 Re (-)</th>
                        <th>動力数 Np (-)</th>
                        <th>フルード数 Fr (-)</th>
                        <th width="50">操作</th>
                    </tr>
                </thead>
                <tbody id="${block.id}-rows">
                    ${rowsHTML}
                </tbody>
                <tfoot>
                    <tr class="ave-row" id="${block.id}-ave-row">
                        <!-- Ave Row values calculated via JS -->
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
    container.appendChild(blockEl);
    feather.replace();
}

function createRowHTML(row, idx, blockId) {
    return `
        <tr data-index="${idx}">
            <td><input type="number" value="${row.time}" oninput="updateRowCell('${blockId}', ${idx}, 'time', this.value)" style="width:70px;"></td>
            <td><input type="number" value="${row.N}" oninput="updateRowCell('${blockId}', ${idx}, 'N', this.value)"></td>
            <td id="${blockId}-${idx}-n" class="calculated-cell">0.00</td>
            <td><input type="number" value="${row.T}" step="0.001" oninput="updateRowCell('${blockId}', ${idx}, 'T', this.value)"></td>
            <td><input type="number" value="${row.Tb}" step="0.001" oninput="updateRowCell('${blockId}', ${idx}, 'Tb', this.value)"></td>
            <td id="${blockId}-${idx}-P" class="calculated-cell">0.00</td>
            <td id="${blockId}-${idx}-Pv" class="calculated-cell">0.00</td>
            <td id="${blockId}-${idx}-mu_eff" class="calculated-cell col-mu-eff">0.00</td>
            <td id="${blockId}-${idx}-Re" class="calculated-cell font-weight-bold">0.00</td>
            <td id="${blockId}-${idx}-Np" class="calculated-cell font-weight-bold">0.00</td>
            <td id="${blockId}-${idx}-Fr" class="calculated-cell">0.00</td>
            <td>
                <button class="row-delete-btn" onclick="deleteRow('${blockId}', ${idx})">
                    <i data-feather="x" style="width:16px;height:16px;"></i>
                </button>
            </td>
        </tr>
    `;
}

function updateRowCell(blockId, idx, field, val) {
    const block = expBlocks.find(b => b.id === blockId);
    if (block) {
        block.rows[idx][field] = parseFloat(val) || 0;
        recalculateBlock(blockId);
        updateChart();
    }
}

function updateBlockName(blockId, newName) {
    const block = expBlocks.find(b => b.id === blockId);
    if (block) {
        block.name = newName;
        saveCurrentState();
    }
}

function addEmptyRow(blockId) {
    const block = expBlocks.find(b => b.id === blockId);
    if (block) {
        let lastTime = 0;
        let lastN = 300;
        if (block.rows.length > 0) {
            lastTime = block.rows[block.rows.length - 1].time;
            lastN = block.rows[block.rows.length - 1].N;
        }
        block.rows.push({
            time: lastTime + 10,
            N: lastN,
            T: 0,
            Tb: 0
        });
        
        // Re-render rows
        const tbody = document.getElementById(`${blockId}-rows`);
        let rowsHTML = '';
        block.rows.forEach((row, idx) => {
            rowsHTML += createRowHTML(row, idx, blockId);
        });
        tbody.innerHTML = rowsHTML;
        feather.replace();
        
        recalculateBlock(blockId);
        updateChart();
    }
}

function deleteRow(blockId, idx) {
    const block = expBlocks.find(b => b.id === blockId);
    if (block && block.rows.length > 1) {
        block.rows.splice(idx, 1);
        // Re-render
        const tbody = document.getElementById(`${blockId}-rows`);
        let rowsHTML = '';
        block.rows.forEach((row, index) => {
            rowsHTML += createRowHTML(row, index, blockId);
        });
        tbody.innerHTML = rowsHTML;
        feather.replace();
        
        recalculateBlock(blockId);
        updateChart();
    } else {
        showToast('ブロックには少なくとも1行必要です。', 'error');
    }
}

// Recalculates individual experimental block
function recalculateBlock(blockId) {
    const block = expBlocks.find(b => b.id === blockId);
    if (!block) return;

    const { rho, mu, d, DT, g } = config;
    const V = calcLiquidVolumeForPv(); // use measured V_act if set, else dish-corrected estimate


    let sumN = 0;
    let sumT = 0;
    let sumTb = 0;

    block.rows.forEach((row, idx) => {
        const n = row.N / 60;
        const mu_eff = calcEffectiveViscosity(n);
        const T_net = row.T - row.Tb;
        const P = 2 * Math.PI * n * T_net;
        const Pv = P / V;
        const Re = calculateReVal(n);
        const Fr = calculateFrVal(n);
        
        // Power number Np
        let Np = 0;
        if (n > 0 && Math.abs(T_net) > 0) {
            Np = P / (rho * Math.pow(n, 3) * Math.pow(d, 5));
        }

        // Write calculated values back to UI
        document.getElementById(`${blockId}-${idx}-n`).textContent = n.toFixed(3);
        document.getElementById(`${blockId}-${idx}-P`).textContent = P.toFixed(3);
        document.getElementById(`${blockId}-${idx}-Pv`).textContent = Pv.toFixed(1);
        document.getElementById(`${blockId}-${idx}-mu_eff`).textContent = mu_eff.toFixed(4);
        document.getElementById(`${blockId}-${idx}-Re`).textContent = Math.round(Re);
        document.getElementById(`${blockId}-${idx}-Np`).textContent = Np.toFixed(3);
        document.getElementById(`${blockId}-${idx}-Fr`).textContent = Fr.toFixed(3);

        sumN += row.N;
        sumT += row.T;
        sumTb += row.Tb;
    });

    const len = block.rows.length;
    const aveN = sumN / len;
    const aveT = sumT / len;
    const aveTb = sumTb / len;

    const ave_n = aveN / 60;
    const ave_Tnet = aveT - aveTb;
    const ave_mu_eff = calcEffectiveViscosity(ave_n);
    const ave_P = 2 * Math.PI * ave_n * ave_Tnet;
    const ave_Pv = ave_P / V;
    const ave_Re = calculateReVal(ave_n);
    const ave_Fr = calculateFrVal(ave_n);
    let ave_Np = 0;
    if (ave_n > 0 && Math.abs(ave_Tnet) > 0) {
        ave_Np = ave_P / (rho * Math.pow(ave_n, 3) * Math.pow(d, 5));
    }

    // Save calculation to block object for plotting
    block.aveCalculated = {
        Re: ave_Re,
        Np: ave_Np,
        Fr: ave_Fr,
        N: aveN,
        P: ave_P,
        Pv: ave_Pv
    };

    // Render Average Row
    const aveRowEl = document.getElementById(`${blockId}-ave-row`);
    aveRowEl.innerHTML = `
        <td>Ave</td>
        <td class="highlight-amber">${aveN.toFixed(1)}</td>
        <td>${ave_n.toFixed(3)}</td>
        <td class="highlight-amber">${aveT.toFixed(3)}</td>
        <td class="highlight-amber">${aveTb.toFixed(5)}</td>
        <td class="highlight-green">${ave_P.toFixed(3)}</td>
        <td>${ave_Pv.toFixed(1)}</td>
        <td class="calculated-cell highlight-blue">${ave_mu_eff.toFixed(4)}</td>
        <td class="calculated-cell highlight-blue">${Math.round(ave_Re)}</td>
        <td class="calculated-cell highlight-blue">${ave_Np.toFixed(2)}</td>
        <td class="calculated-cell highlight-blue">${ave_Fr.toFixed(2)}</td>
        <td></td>
    `;

    // Update Header Meta
    document.getElementById(`${blockId}-meta-re`).innerHTML = `Re: <strong>${Math.round(ave_Re)}</strong>`;
    document.getElementById(`${blockId}-meta-np`).innerHTML = `Np: <strong>${ave_Np.toFixed(2)}</strong>`;
    document.getElementById(`${blockId}-meta-fr`).innerHTML = `Fr: <strong>${ave_Fr.toFixed(2)}</strong>`;
    updateLowReWarning();
}

function updateLowReWarning() {
    const warningEl = document.getElementById('low-re-warning');
    if (!warningEl) return;

    const hasLowRe = expBlocks.some(block => block.rows.some(row => {
        const n = row.N / 60;
        if (n <= 0) return false;
        const Re = calculateReVal(n);
        return Re > 0 && Re < 10;
    }));

    warningEl.style.display = hasLowRe ? 'flex' : 'none';
}

// chartAreaBorder plugin to draw chart outer frame
const chartAreaBorder = {
    id: 'chartAreaBorder',
    afterDraw(chart) {
        const {ctx, chartArea: {top, right, bottom, left, width, height}} = chart;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // Bright Frame color for premium look
        ctx.lineWidth = 2.0; // Slightly thicker
        ctx.strokeRect(left, top, width, height);
        ctx.restore();
    }
};

// chartRegions plugin to draw Laminar, Transitional, and Turbulent regions on main screen (dark mode)
const chartRegions = {
    id: 'chartRegions',
    beforeDraw(chart) {
        const {ctx, chartArea: {top, bottom, left, right, height}, scales: {x}} = chart;
        if (!x) return;
        ctx.save();

        const laminarBoundary = 10;
        const turbulentBoundary = 1000;

        const xLaminar = x.getPixelForValue(laminarBoundary);
        const xTurbulent = x.getPixelForValue(turbulentBoundary);

        const pLaminar = Math.max(left, Math.min(right, xLaminar));
        const pTurbulent = Math.max(left, Math.min(right, xTurbulent));

        // Draw background bands (faint white/gray overlay for dark theme)
        if (pLaminar > left) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.015)';
            ctx.fillRect(left, top, pLaminar - left, height);
        }
        if (pTurbulent > pLaminar) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            ctx.fillRect(pLaminar, top, pTurbulent - pLaminar, height);
        }
        if (right > pTurbulent) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
            ctx.fillRect(pTurbulent, top, right - pTurbulent, height);
        }

        // Draw boundary dashed lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);

        if (xLaminar >= left && xLaminar <= right) {
            ctx.beginPath();
            ctx.moveTo(xLaminar, top);
            ctx.lineTo(xLaminar, bottom);
            ctx.stroke();
        }
        if (xTurbulent >= left && xTurbulent <= right) {
            ctx.beginPath();
            ctx.moveTo(xTurbulent, top);
            ctx.lineTo(xTurbulent, bottom);
            ctx.stroke();
        }

        // Draw Region labels
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = 'bold 11px Inter, Outfit, Noto Sans JP, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const drawLabel = (textLines, xCenter, yStart) => {
            textLines.forEach((line, index) => {
                ctx.fillText(line, xCenter, yStart + index * 14);
            });
        };

        const labelY = top + 12;

        if (pLaminar > left && (pLaminar - left) > 50) {
            drawLabel(['層流域', 'Re ≦ 10'], (left + pLaminar) / 2, labelY);
        }
        if (pTurbulent > pLaminar && (pTurbulent - pLaminar) > 50) {
            drawLabel(['遷移域', '10 < Re < 10³'], (pLaminar + pTurbulent) / 2, labelY);
        }
        if (right > pTurbulent && (right - pTurbulent) > 50) {
            drawLabel(['乱流域', 'Re ≧ 10³'], (pTurbulent + right) / 2, labelY);
        }

        ctx.restore();
    }
};

// lightChartRegions plugin to draw Laminar, Transitional, and Turbulent regions on PDF chart (light mode)
const lightChartRegions = {
    id: 'lightChartRegions',
    beforeDraw(chart) {
        const {ctx, chartArea: {top, bottom, left, right, height}, scales: {x}} = chart;
        if (!x) return;
        ctx.save();

        const laminarBoundary = 10;
        const turbulentBoundary = 1000;

        const xLaminar = x.getPixelForValue(laminarBoundary);
        const xTurbulent = x.getPixelForValue(turbulentBoundary);

        const pLaminar = Math.max(left, Math.min(right, xLaminar));
        const pTurbulent = Math.max(left, Math.min(right, xTurbulent));

        // Draw background bands (faint dark overlay for light theme)
        if (pLaminar > left) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.015)';
            ctx.fillRect(left, top, pLaminar - left, height);
        }
        if (pTurbulent > pLaminar) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
            ctx.fillRect(pLaminar, top, pTurbulent - pLaminar, height);
        }
        if (right > pTurbulent) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.045)';
            ctx.fillRect(pTurbulent, top, right - pTurbulent, height);
        }

        // Draw boundary dashed lines
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 5]);

        if (xLaminar >= left && xLaminar <= right) {
            ctx.beginPath();
            ctx.moveTo(xLaminar, top);
            ctx.lineTo(xLaminar, bottom);
            ctx.stroke();
        }
        if (xTurbulent >= left && xTurbulent <= right) {
            ctx.beginPath();
            ctx.moveTo(xTurbulent, top);
            ctx.lineTo(xTurbulent, bottom);
            ctx.stroke();
        }

        // Draw Region labels
        ctx.fillStyle = 'rgba(17, 24, 39, 0.65)'; // Dark text
        ctx.font = 'bold 10px Inter, Outfit, Noto Sans JP, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const drawLabel = (textLines, xCenter, yStart) => {
            textLines.forEach((line, index) => {
                ctx.fillText(line, xCenter, yStart + index * 13);
            });
        };

        const labelY = top + 10;

        if (pLaminar > left && (pLaminar - left) > 50) {
            drawLabel(['層流域', 'Re ≦ 10'], (left + pLaminar) / 2, labelY);
        }
        if (pTurbulent > pLaminar && (pTurbulent - pLaminar) > 50) {
            drawLabel(['遷移域', '10 < Re < 10³'], (pLaminar + pTurbulent) / 2, labelY);
        }
        if (right > pTurbulent && (right - pTurbulent) > 50) {
            drawLabel(['乱流域', 'Re ≧ 10³'], (pTurbulent + right) / 2, labelY);
        }

        ctx.restore();
    }
};

// chartNjsLabel plugin to draw label next to Njs point on main screen chart
const chartNjsLabel = {
    id: 'chartNjsLabel',
    afterDatasetsDraw(chart) {
        const {ctx, scales: {x, y}} = chart;
        if (!x || !y) return;
        
        const njsDataset = chart.data.datasets.find(ds => ds.label === '完全浮遊限界速度 Njs');
        if (!njsDataset || !njsDataset.data || njsDataset.data.length === 0) return;
        
        const pt = njsDataset.data[0];
        const px = x.getPixelForValue(pt.x);
        const py = y.getPixelForValue(pt.y);
        
        if (px === undefined || py === undefined) return;
        
        ctx.save();
        const text = 'Njs (完全浮遊)';
        ctx.font = 'bold 11px Inter, Outfit, Noto Sans JP, sans-serif';
        const textWidth = ctx.measureText(text).width;
        
        // Draw background pill to mask overlapping elements
        ctx.fillStyle = 'rgba(11, 15, 25, 0.92)'; // Dark background matching theme
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)'; // Red border matching dot
        ctx.lineWidth = 1.2;
        
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(px + 12, py - 9, textWidth + 12, 18, 4);
        } else {
            ctx.rect(px + 12, py - 9, textWidth + 12, 18);
        }
        ctx.fill();
        ctx.stroke();
        
        // Draw white text inside the pill
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, px + 18, py);
        ctx.restore();
    }
};

// lightChartNjsLabel plugin to draw label next to Njs point on PDF chart
const lightChartNjsLabel = {
    id: 'lightChartNjsLabel',
    afterDatasetsDraw(chart) {
        const {ctx, scales: {x, y}} = chart;
        if (!x || !y) return;
        
        const njsDataset = chart.data.datasets.find(ds => ds.label === '完全浮遊限界速度 Njs');
        if (!njsDataset || !njsDataset.data || njsDataset.data.length === 0) return;
        
        const pt = njsDataset.data[0];
        const px = x.getPixelForValue(pt.x);
        const py = y.getPixelForValue(pt.y);
        
        if (px === undefined || py === undefined) return;
        
        ctx.save();
        const text = 'Njs (完全浮遊)';
        ctx.font = 'bold 9px Inter, Outfit, Noto Sans JP, sans-serif';
        const textWidth = ctx.measureText(text).width;
        
        // Draw light background pill for print mode
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = 'rgba(220, 38, 38, 0.85)';
        ctx.lineWidth = 1.0;
        
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(px + 10, py - 8, textWidth + 10, 16, 3);
        } else {
            ctx.rect(px + 10, py - 8, textWidth + 10, 16);
        }
        ctx.fill();
        ctx.stroke();
        
        // Draw dark text inside the pill
        ctx.fillStyle = '#111827';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, px + 15, py);
        ctx.restore();
    }
};

function recalculateExperimentalData() {
    expBlocks.forEach(b => {
        recalculateBlock(b.id);
    });
}

// ============================================================
// Rheology: effective viscosity (Metzner-Otto method)
// ============================================================

function calcEffectiveViscosity(n_rps) {
    const m = rheologyData.activeModel;
    const modelList = rheologyData.samples[rheologyData.activeSample] || [];
    const p = modelList.find(r => r.modelId === m);
    const ks = rheologyData.ks || 11.5;
    const gamma_dot = ks * n_rps;

    if (!p || m === 'newtonian') return config.mu;

    const pr = p.params;
    switch (m) {
        case 'powerlaw':
            if (pr.K > 0 && pr.n > 0 && n_rps > 0)
                return pr.K * Math.pow(gamma_dot, pr.n - 1);
            break;
        case 'bingham':
            if (n_rps > 0) return pr.tau_y / gamma_dot + pr.eta_p;
            break;
        case 'casson':
            if (n_rps > 0) {
                const s = Math.sqrt(pr.eta_p) + Math.sqrt(pr.tau_y / gamma_dot);
                return s * s;
            }
            break;
        case 'hb':
            if (n_rps > 0)
                return pr.tau_y / gamma_dot + pr.K * Math.pow(gamma_dot, pr.n - 1);
            break;
        case 'cross':
            return pr.eta_inf + (pr.eta_0 - pr.eta_inf) / (1 + Math.pow(pr.K * gamma_dot, pr.m));
        case 'carreau':
            return pr.eta_inf + (pr.eta_0 - pr.eta_inf) *
                   Math.pow(1 + Math.pow(pr.lambda * gamma_dot, 2), (pr.n - 1) / 2);
        default:
            break;
    }
    return config.mu;
}

function calcKsMetznerOtto() {
    const m = rheologyData.activeModel;
    const modelList = rheologyData.samples[rheologyData.activeSample] || [];
    const p = modelList.find(r => r.modelId === m);
    if (!p || m === 'newtonian') return null;
    const pr = p.params;
    const { rho, d } = config;
    const ksValues = [];

    function invertNpToRe(Np_exp) {
        if (Np_exp <= 0) return null;
        let lo = 0.01, hi = 1e7;
        for (let i = 0; i < 80; i++) {
            const mid = (lo + hi) / 2;
            if (calculateNpCurve(mid) > Np_exp) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }

    expBlocks.forEach(block => {
        block.rows.forEach(row => {
            const n = row.N / 60;
            const T_net = row.T - row.Tb;
            if (n <= 0 || T_net <= 0) return;
            const P = 2 * Math.PI * n * T_net;
            const Np_exp = P / (rho * Math.pow(n, 3) * Math.pow(d, 5));
            const Re_eff = invertNpToRe(Np_exp);
            if (!Re_eff) return;
            const mu_eff = rho * n * d * d / Re_eff;
            if (mu_eff <= 0) return;

            function residual(gd) {
                switch (m) {
                    case 'powerlaw': return pr.K * Math.pow(gd, pr.n - 1) - mu_eff;
                    case 'bingham':  return pr.tau_y / gd + pr.eta_p - mu_eff;
                    case 'casson': { const s = Math.sqrt(pr.eta_p) + Math.sqrt(pr.tau_y / gd); return s * s - mu_eff; }
                    case 'hb':       return pr.tau_y / gd + pr.K * Math.pow(gd, pr.n - 1) - mu_eff;
                    case 'cross':    return pr.eta_inf + (pr.eta_0 - pr.eta_inf) / (1 + Math.pow(pr.K * gd, pr.m)) - mu_eff;
                    case 'carreau':  return pr.eta_inf + (pr.eta_0 - pr.eta_inf) * Math.pow(1 + Math.pow(pr.lambda * gd, 2), (pr.n - 1) / 2) - mu_eff;
                    default: return NaN;
                }
            }
            const r_lo = residual(0.01), r_hi = residual(1e6);
            if (isNaN(r_lo) || isNaN(r_hi) || r_lo * r_hi > 0) return;
            let blo = 0.01, bhi = 1e6;
            for (let i = 0; i < 80; i++) {
                const mid = (blo + bhi) / 2;
                if (residual(mid) * r_lo > 0) blo = mid; else bhi = mid;
            }
            const gamma_dot = (blo + bhi) / 2;
            if (gamma_dot > 0 && n > 0) ksValues.push(gamma_dot / n);
        });
    });

    if (ksValues.length === 0) return null;
    const ksMean = ksValues.reduce((a, b) => a + b, 0) / ksValues.length;
    const ksStd  = Math.sqrt(ksValues.reduce((a, b) => a + (b - ksMean) ** 2, 0) / ksValues.length);
    return { ksValues, ksMean, ksStd };
}

// ============================================================
// Rheology CSV import
// ============================================================

function processRheologyCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    const dataLines = lines.filter(l => l.trim() && !l.startsWith('#'));
    if (dataLines.length < 2) { showToast('CSVの形式が不正です', 'error'); return; }

    const headers = dataLines[0].split(',').map(h => h.trim());
    const idx = {};
    headers.forEach((h, i) => { idx[h] = i; });

    const MODEL_ID_MAP = {
        'Newtonian': 'newtonian', 'Bingham': 'bingham', 'Casson': 'casson',
        'Power-law': 'powerlaw', 'Herschel-Bulkley': 'hb', 'Cross': 'cross', 'Carreau': 'carreau'
    };

    const samples = {};
    dataLines.slice(1).forEach(line => {
        if (!line.trim()) return;
        const cols = [];
        let cur = '', inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
            else cur += ch;
        }
        cols.push(cur);
        const clean = cols.map(c => c.trim());
        const sampleName = clean[idx['Sample']] || '';
        const modelName  = clean[idx['Model']]  || '';
        const modelId = MODEL_ID_MAP[modelName] || modelName.toLowerCase();
        const g = key => { const x = parseFloat(clean[idx[key]]); return isNaN(x) ? undefined : x; };

        const params = {};
        if (g('eta_0_Pas')   !== undefined) params.eta_0   = g('eta_0_Pas');
        if (g('tau_y_Pa')    !== undefined) params.tau_y   = g('tau_y_Pa');
        if (g('eta_p_Pas')   !== undefined) params.eta_p   = g('eta_p_Pas');
        if (g('K_Pasn')      !== undefined) params.K       = g('K_Pasn');
        if (g('n_flow')      !== undefined) params.n       = g('n_flow');
        if (g('lambda_s')    !== undefined) params.lambda  = g('lambda_s');
        if (g('m_cross')     !== undefined) params.m       = g('m_cross');
        if (g('eta_inf_Pas') !== undefined) params.eta_inf = g('eta_inf_Pas');

        if (!samples[sampleName]) samples[sampleName] = [];
        samples[sampleName].push({
            modelId, name: modelName,
            rating: clean[idx['Rating']] || '',
            r2:   parseFloat(clean[idx['R2']])      || 0,
            rmse: parseFloat(clean[idx['RMSE_Pa']]) || 0,
            mae:  parseFloat(clean[idx['MAE_Pa']])  || 0,
            params
        });
    });

    if (Object.keys(samples).length === 0) { showToast('有効なデータが見つかりません', 'error'); return; }
    rheologyData.samples = samples;
    rheologyData.activeSample = Object.keys(samples)[0];
    rheologyData.activeModel = 'newtonian';
    updateRheologyUI();
    recalculateAll();
    showToast('レオロジーデータを読み込みました', 'success');
}

function loadRheologyCSV(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        processRheologyCSV(e.target.result);
    };
    reader.readAsText(file);
}

function updateRheologyUI() {
    const sampleSel = document.getElementById('rheology-sample-select');
    const modelSel  = document.getElementById('rheology-model-select');
    const muEffDiv  = document.getElementById('mu-eff-display');
    const ksGroup   = document.getElementById('ks-group');
    const muEffContainer = document.getElementById('mu-eff-container');
    const clearBtn = document.getElementById('btn-clear-rheology');

    const samples = Object.keys(rheologyData.samples);
    if (samples.length === 0) {
        if (clearBtn) clearBtn.style.display = 'none';
        sampleSel.innerHTML = '<option value="">-- CSV未読込 --</option>';
        sampleSel.disabled = true; sampleSel.style.opacity = '0.5';
        modelSel.innerHTML = '<option value="newtonian">Newtonian（μ = 一定）</option>';
        if (muEffContainer) muEffContainer.style.display = 'none';
        ksGroup.style.opacity = '0.4';
        return;
    }

    if (clearBtn) clearBtn.style.display = 'inline-flex';
    sampleSel.innerHTML = samples.map(s =>
        `<option value="${s}"${s === rheologyData.activeSample ? ' selected' : ''}>${s}</option>`).join('');
    sampleSel.disabled = false; sampleSel.style.opacity = '1';

    const modelRows = rheologyData.samples[rheologyData.activeSample] || [];
    const ICON = { excellent: '◎', good: '○', fair: '△', poor: '×', invalid: '×', insufficient: '―' };
    let opts = `<option value="newtonian"${rheologyData.activeModel === 'newtonian' ? ' selected' : ''}>◎ Newtonian（μ = ${config.mu} Pa·s）</option>`;
    modelRows.forEach(r => {
        if (r.modelId === 'newtonian') {
            opts = `<option value="newtonian"${rheologyData.activeModel === 'newtonian' ? ' selected' : ''}>${ICON[r.rating] || '-'} Newtonian μ=${r.params.eta_0 ? r.params.eta_0.toFixed(4) : config.mu} Pa·s [R²=${r.r2.toFixed(4)}]</option>`;
            return;
        }
        opts += `<option value="${r.modelId}"${r.modelId === rheologyData.activeModel ? ' selected' : ''}>${ICON[r.rating] || '-'} ${r.name} [R²=${r.r2.toFixed(4)}]</option>`;
    });
    modelSel.innerHTML = opts;

    const isNewt = rheologyData.activeModel === 'newtonian';
    // ニュートン流体が選択されている場合は、UI の mu 入力値を保持（CSV の eta_0 は使わない）
    // 非ニュートン流体が選択されている場合も、config.mu は上書きしない（ベース液粘度として保持）
    const selectedModelInfo = rheologyData.samples[rheologyData.activeSample]?.find(r => r.modelId === rheologyData.activeModel);
    // NOTE: config.mu はユーザー入力値として保持し、レオロジーデータ選択時に上書きしない
    
    // μ_eff 列の表示/非表示を制御
    const muEffCells = document.querySelectorAll('.col-mu-eff');
    muEffCells.forEach(cell => {
        cell.style.display = isNewt ? 'none' : 'table-cell';
    });
    
    const cavernModelGroup = document.getElementById('cavern-model-group');
    if (cavernModelGroup) {
        const isYieldFluid = rheologyData.activeModel === 'bingham' || rheologyData.activeModel === 'casson' || rheologyData.activeModel === 'hb';
        cavernModelGroup.style.display = isYieldFluid ? 'block' : 'none';
    }

    let allN = [];
    expBlocks.forEach(b => b.rows.forEach(r => { if (r.N > 0) allN.push(r.N / 60); }));
    const n_rep = allN.length > 0 ? allN.reduce((a, b) => a + b, 0) / allN.length : 100 / 60;
    const mu_eff = calcEffectiveViscosity(n_rep);

    if (isNewt) {
        ksGroup.style.display = 'none';
        if (muEffContainer) muEffContainer.style.display = 'none';
    } else {
        ksGroup.style.display = 'block';
        if (muEffContainer) {
            muEffContainer.style.display = 'flex';
            muEffContainer.style.flexDirection = 'column';
            if (muEffDiv) {
                muEffDiv.style.display = 'block';
                muEffDiv.innerHTML = `${mu_eff.toFixed(4)} <span style="font-size:0.75rem;">(N≈${(n_rep * 60).toFixed(0)}rpm)</span>`;
            }
        }
    }
}

function initRheologyListeners() {
    document.getElementById('rheology-csv-input').addEventListener('change', e => {
        if (e.target.files[0]) loadRheologyCSV(e.target.files[0]);
        e.target.value = '';
    });
    const clearBtn = document.getElementById('btn-clear-rheology');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            rheologyData = { samples: {}, activeSample: null, activeModel: 'newtonian', ks: 11.5 };
            updateRheologyUI();
            recalculateAll();
            showToast('レオロジーデータをクリアしました', 'info');
        });
    }
    document.getElementById('rheology-sample-select').addEventListener('change', e => {
        rheologyData.activeSample = e.target.value;
        rheologyData.activeModel = 'newtonian';
        updateRheologyUI();
        recalculateAll();
    });
    document.getElementById('rheology-model-select').addEventListener('change', e => {
        rheologyData.activeModel = e.target.value;
        updateRheologyUI();
        recalculateAll();
    });
    document.getElementById('ks-input').addEventListener('input', e => {
        rheologyData.ks = parseFloat(e.target.value) || 11.5;
        updateRheologyUI();
        recalculateAll();
    });
    const cavernModelSelect = document.getElementById('cavern-model');
    if (cavernModelSelect) {
        cavernModelSelect.addEventListener('change', e => {
            config.cavernModel = e.target.value;
            saveCurrentState();
            recalculateAll();
        });
    }
}

function calculateReVal(n) {
    return (config.rho * n * Math.pow(config.d, 2)) / calcEffectiveViscosity(n);
}

function calculateFrVal(n) {
    return (Math.pow(n, 2) * config.DT) / config.g;
}

// ----------------------------------------------------
// Graph / Charting (Chart.js log-log support)
// ----------------------------------------------------

function initChart() {
    const ctx = document.getElementById('rushtonChart').getContext('2d');
    
    // Draw empty grid
    chart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: []
        },
        plugins: [chartAreaBorder, chartRegions, chartNjsLabel],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 400
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#f3f4f6',
                        font: {
                            family: 'Inter',
                            size: 11
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: (Re: ${context.raw.x.toFixed(1)}, Np: ${context.raw.y.toFixed(3)})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'logarithmic',
                    title: {
                        display: true,
                        text: 'レイノルズ数 Re [-]',
                        color: '#f3f4f6',
                        font: {
                            family: 'Outfit',
                            size: 14,
                            weight: 600
                        }
                    },
                    border: {
                        display: true,
                        color: 'rgba(255, 255, 255, 0.6)',
                        width: 2.0
                    },
                    grid: {
                        color: function(context) {
                            if (!context.tick) return 'rgba(255, 255, 255, 0.05)';
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return 'rgba(255, 255, 255, 0.45)'; // Bright Major gridline
                            }
                            return 'rgba(255, 255, 255, 0.22)'; // Clear Minor gridline
                        },
                        lineWidth: function(context) {
                            if (!context.tick) return 1;
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return 1.2;
                            }
                            return 0.8;
                        },
                        tickColor: function(context) {
                            if (!context.tick) return 'rgba(255, 255, 255, 0.15)';
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return 'rgba(255, 255, 255, 0.7)';
                            }
                            return 'rgba(255, 255, 255, 0.35)';
                        },
                        tickLength: function(context) {
                            if (!context.tick) return 6;
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return 8; // Longer major tick
                            }
                            return 4; // Shorter minor tick
                        }
                    },
                    ticks: {
                        color: '#f3f4f6',
                        callback: function(value) {
                            const log10 = Math.log10(value);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return '10' + getSuperScript(Math.round(log10));
                            }
                            return ''; // Return empty string so the tick and gridline are preserved
                        }
                    },
                    afterBuildTicks: function(scale) {
                        const ticks = [];
                        const minVal = (scale.min !== undefined && scale.min !== null && !isNaN(scale.min)) ? scale.min : ((scale.dataMin !== undefined && scale.dataMin !== null) ? scale.dataMin : 1.0);
                        const maxVal = (scale.max !== undefined && scale.max !== null && !isNaN(scale.max)) ? scale.max : ((scale.dataMax !== undefined && scale.dataMax !== null) ? scale.dataMax : 100000000);
                        const minLog = Math.floor(Math.log10(minVal));
                        const maxLog = Math.ceil(Math.log10(maxVal));
                        for (let log = minLog; log <= maxLog; log++) {
                            const base = Math.pow(10, log);
                            for (let i = 1; i <= 9; i++) {
                                const val = base * i;
                                if (val >= minVal && val <= maxVal) {
                                    ticks.push({ 
                                        value: val,
                                        major: (i === 1)
                                    });
                                }
                            }
                        }
                        scale.ticks = ticks;
                    },
                    min: 1,
                    max: 100000000
                },
                y: {
                    type: 'logarithmic',
                    title: {
                        display: true,
                        text: '動力数 Np [-]',
                        color: '#f3f4f6',
                        font: {
                            family: 'Outfit',
                            size: 14,
                            weight: 600
                        }
                    },
                    border: {
                        display: true,
                        color: 'rgba(255, 255, 255, 0.6)',
                        width: 2.0
                    },
                    grid: {
                        color: function(context) {
                            if (!context.tick) return 'rgba(255, 255, 255, 0.05)';
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return 'rgba(255, 255, 255, 0.45)'; // Bright Major gridline
                            }
                            return 'rgba(255, 255, 255, 0.22)'; // Clear Minor gridline
                        },
                        lineWidth: function(context) {
                            if (!context.tick) return 1;
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return 1.2;
                            }
                            return 0.8;
                        },
                        tickColor: function(context) {
                            if (!context.tick) return 'rgba(255, 255, 255, 0.15)';
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return 'rgba(255, 255, 255, 0.7)';
                            }
                            return 'rgba(255, 255, 255, 0.35)';
                        },
                        tickLength: function(context) {
                            if (!context.tick) return 6;
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return 8; // Longer major tick
                            }
                            return 4; // Shorter minor tick
                        }
                    },
                    ticks: {
                        color: '#f3f4f6',
                        callback: function(value) {
                            const log10 = Math.log10(value);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return '10' + getSuperScript(Math.round(log10));
                            }
                            return ''; // Return empty string so the tick and gridline are preserved
                        }
                    },
                    afterBuildTicks: function(scale) {
                        const ticks = [];
                        const minVal = (scale.min !== undefined && scale.min !== null && !isNaN(scale.min)) ? scale.min : ((scale.dataMin !== undefined && scale.dataMin !== null) ? scale.dataMin : 0.01);
                        const maxVal = (scale.max !== undefined && scale.max !== null && !isNaN(scale.max)) ? scale.max : ((scale.dataMax !== undefined && scale.dataMax !== null) ? scale.dataMax : 100);
                        const minLog = Math.floor(Math.log10(minVal));
                        const maxLog = Math.ceil(Math.log10(maxVal));
                        for (let log = minLog; log <= maxLog; log++) {
                            const base = Math.pow(10, log);
                            for (let i = 1; i <= 9; i++) {
                                const val = base * i;
                                if (val >= minVal && val <= maxVal) {
                                    ticks.push({ 
                                        value: val,
                                        major: (i === 1)
                                    });
                                }
                            }
                        }
                        scale.ticks = ticks;
                    },
                    min: document.getElementById('chart-ymin') && document.getElementById('chart-ymin').value !== 'auto' ? parseFloat(document.getElementById('chart-ymin').value) : undefined,
                    max: document.getElementById('chart-ymax') && document.getElementById('chart-ymax').value !== 'auto' ? parseFloat(document.getElementById('chart-ymax').value) : undefined
                }
            }
        }
    });
}

function getSuperScript(num) {
    const superscripts = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        '-': '⁻'
    };
    return num.toString().split('').map(c => superscripts[c] || c).join('');
}

function updateChart() {
    if (!chart) {
        initChart();
        const ymin = document.getElementById('chart-ymin') && document.getElementById('chart-ymin').value !== 'auto' ? parseFloat(document.getElementById('chart-ymin').value) : undefined;
        const ymax = document.getElementById('chart-ymax') && document.getElementById('chart-ymax').value !== 'auto' ? parseFloat(document.getElementById('chart-ymax').value) : undefined;
        chart.options.scales.y.min = ymin;
        chart.options.scales.y.max = ymax;
    }

    // 1. Generate Experimental Dots & Find Re Range
    let minRe = 0.1;
    let maxRe = 100000;
    const expDots = [];
    const expDotsBase = [];
    const isNewt = (rheologyData.activeModel === 'newtonian' || !rheologyData.activeModel);

    expBlocks.forEach(b => {
        if (b.aveCalculated && b.aveCalculated.Re > 0 && b.aveCalculated.Np > 0) {
            expDots.push({
                x: b.aveCalculated.Re,
                y: b.aveCalculated.Np,
                N: b.aveCalculated.N
            });
            if (b.aveCalculated.Re < minRe) minRe = b.aveCalculated.Re;
            if (b.aveCalculated.Re > maxRe) maxRe = b.aveCalculated.Re;

            if (!isNewt) {
                const n_rps = b.aveCalculated.N / 60;
                const Re_base = (config.rho * n_rps * Math.pow(config.d, 2)) / config.mu;
                if (Re_base > 0) {
                    expDotsBase.push({
                        x: Re_base,
                        y: b.aveCalculated.Np,
                        N: b.aveCalculated.N
                    });
                    if (Re_base < minRe) minRe = Re_base;
                    if (Re_base > maxRe) maxRe = Re_base;
                }
            }
        }
    });

    // レイノルズ数表示範囲を 10^0 (1) 以上 10^8 (100,000,000) までに固定
    const startLog = 0;
    const endLog = 8;
    chart.options.scales.x.min = Math.pow(10, startLog);
    chart.options.scales.x.max = Math.pow(10, endLog);

    // 2. Generate Prediction Curves
    const unbaffledData = [];
    const baffledData = [];
    const maxData = [];
    const stepsPerDecade = 25;
    const vars = getKameiHiraokaIntermediateVars();
    const NpMax = vars.NpMax;

    for (let i = startLog * stepsPerDecade; i <= endLog * stepsPerDecade; i++) {
        const Re = Math.pow(10, i / stepsPerDecade);
        const { Np0, Np } = calculateNpCurve(Re);
        
        if (Np0 > 0) unbaffledData.push({ x: Re, y: Np0 });
        if (Np > 0) baffledData.push({ x: Re, y: Np });
        if (NpMax > 0) maxData.push({ x: Re, y: NpMax });
    }

    // Replace Datasets
    const datasets = [
        {
            label: '完全邪魔板推算値 (NpMax)',
            data: maxData,
            showLine: true,
            borderColor: '#ef4444',
            borderWidth: 1.5,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
        },
        {
            label: '邪魔板なし推算曲線 (Np0)',
            data: unbaffledData,
            showLine: true,
            borderColor: '#f59e0b',
            borderWidth: 2,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false
        },
        {
            label: config.baffleActive ? '邪魔板あり推算曲線 (Np)' : '邪魔板なし推算曲線 (Np)',
            data: baffledData,
            showLine: true,
            borderColor: '#06b6d4',
            borderWidth: 3,
            pointRadius: 0,
            fill: false
        }
    ];

    if (!isNewt) {
        datasets.push({
            label: '実測値 (ベース液粘度)',
            data: expDotsBase,
            showLine: false,
            backgroundColor: 'transparent',
            borderColor: '#10b981',
            borderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointStyle: 'circle'
        });
    }

    datasets.push({
        label: isNewt ? '実験データ (実測値)' : '実測値 (代表粘度・非ニュートン)',
        data: expDots,
        showLine: false,
        backgroundColor: '#10b981',
        borderColor: '#f3f4f6',
        borderWidth: 1.5,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointStyle: 'circle'
    });

    // 3. Generate Just-Suspended Speed (Njs) Plot Point (only if solid-liquid system is active)
    if (config.solidLiquidActive) {
        const njsRes = calculateNjs();
        if (!njsRes.error && njsRes.Njs_rpm > 0) {
            // Calculate Re at Njs
            const Re_Njs = (config.rho * njsRes.Njs_rps * Math.pow(config.d, 2)) / njsRes.mu;
            // Calculate Np at Re_Njs
            const { Np } = calculateNpCurve(Re_Njs);
            
            datasets.push({
                label: '完全浮遊限界速度 Njs',
                data: [{ x: Re_Njs, y: Np }],
                showLine: false,
                backgroundColor: '#ef4444', // Red dot
                borderColor: '#f3f4f6',
                borderWidth: 2,
                pointRadius: 9,
                pointHoverRadius: 11,
                pointStyle: 'rectRot' // diamond shape
            });
        }
    }

    chart.data.datasets = datasets;

    chart.update();
}

// ----------------------------------------------------
// Sample Data & CSV Handling
// ----------------------------------------------------

function loadSampleData() {
    // Parameters matches image 1 & 2
    config.g = 9.806;
    config.liquidTemp = 25;
    config.rho = 998;
    config.mu = 0.417; // matches experimental rows in image 1 (4.17E-01)
    config.DT = 0.105;
    config.H = 0.093;
    config.headType = 'semi-elliptical';
    config.impellerType = 'pitched-paddle';
    config.np = 4;
    config.theta = 45;
    config.d = 0.060;
    config.b = 0.020;
    config.clearance = 0.020;
    config.n_stage = 1;
    config.baffleActive = true;
    config.nB = 1;
    config.Bw = 0.014;

    initInputs();

    // Create Sample blocks based on image 1
    expBlocks = [];
    document.getElementById('blocks-container').innerHTML = '';

    // Block 300 rpm
    addBlock({ name: '300 rpm 条件', N_default: 300, T_default: 0.000, Tb_default: 0.001 });
    // Block 400 rpm
    addBlock({ name: '400 rpm 条件', N_default: 400, T_default: 0.000, Tb_default: 0.023 });
    // Block 500 rpm
    addBlock({ name: '500 rpm 条件', N_default: 500, T_default: 0.000, Tb_default: 0.035 });
    // Block 600 rpm
    addBlock({ name: '600 rpm 条件', N_default: 600, T_default: 0.050, Tb_default: 0.039 }); // Torq Ave: T=0.050, Tb=0.039

    // Overwrite the Average Torques to match Image 1's "Ave" values perfectly
    // For 300 rpm block
    const b300 = expBlocks[0];
    b300.rows[0].Tb = 0.003;
    b300.rows[1].Tb = 0.003;
    b300.rows[2].Tb = 0.001;
    b300.rows[3].Tb = 0.001;
    b300.rows[4].Tb = 0.001;
    b300.rows[5].Tb = 0.001;
    b300.rows[6].Tb = 0.001;
    // We adjust the first row for N to make Average rotation N=650 rpm as shown in image 1
    // Actually, Ave row in 300 rpm block had N=650 rpm, T=0.08, Tb=0.040714
    // We will set a custom Ave override or just update the rows:
    b300.rows.forEach(r => { r.N = 650; r.T = 0.08; }); // Torq Ave: T=0.08, Tb=0.040714
    b300.name = '650 rpm 代表条件';

    // For 400 rpm block
    const b400 = expBlocks[1];
    b400.rows[0].Tb = 0.025;
    b400.rows[1].Tb = 0.027;
    b400.rows[2].Tb = 0.024;
    b400.rows[3].Tb = 0.025;
    b400.rows[4].Tb = 0.021;
    b400.rows[5].Tb = 0.018;
    b400.rows[6].Tb = 0.023;
    b400.rows.forEach(r => { r.N = 400; r.T = 0.040; });

    // For 500 rpm block
    const b500 = expBlocks[2];
    b500.rows[0].Tb = 0.034;
    b500.rows[1].Tb = 0.035;
    b500.rows[2].Tb = 0.037;
    b500.rows[3].Tb = 0.035;
    b500.rows[4].Tb = 0.034;
    b500.rows[5].Tb = 0.036;
    b500.rows[6].Tb = 0.039;
    b500.rows.forEach(r => { r.N = 500; r.T = 0.050; });

    // For 600 rpm block
    const b600 = expBlocks[3];
    b600.rows[0].Tb = 0.041;
    b600.rows[1].Tb = 0.040;
    b600.rows[2].Tb = 0.041;
    b600.rows[3].Tb = 0.041;
    b600.rows[4].Tb = 0.041;
    b600.rows[5].Tb = 0.042;
    b600.rows[6].Tb = 0.039;
    b600.rows.forEach(r => { r.N = 600; r.T = 0.059; });

    // Re-render blocks
    document.getElementById('blocks-container').innerHTML = '';
    expBlocks.forEach(b => renderBlockHTML(b));

    recalculateAll();
    
    // サンプル用のレオロジーCSVデータを読み込む
    const sampleCSV = `Sample,Model,Rating,R2,RMSE_Pa,MAE_Pa,eta_0_Pas,tau_y_Pa,eta_p_Pas,K_Pasn,n_flow,lambda_s,m_cross,eta_inf_Pas
カオリンスラリー (40wt%),Bingham,Excellent,0.995,0.12,0.08,0,5.2,0.025,0,0,0,0,0
ヨーグルト (プレーン),Casson,Good,0.985,0.25,0.18,0,6.5,0.15,0,0,0,0,0
トマトペースト (30Brix),Herschel-Bulkley,Excellent,0.998,0.50,0.30,0,18.0,0,15.0,0.40,0,0,0
キサンタンガム水溶液 (0.5%),Power-law,Fair,0.950,1.50,1.20,0,0,0,2.1,0.25,0,0,0
グリセリン (20℃),Newtonian,Excellent,0.999,0.01,0.01,1.41,0,0,0,0,0,0,0
マヨネーズ,Herschel-Bulkley,Good,0.988,1.2,0.8,0,65.0,0,12.0,0.55,0,0,0
歯磨き粉,Bingham,Good,0.980,2.5,1.8,0,120.0,25.0,0,0,0,0,0`;

    processRheologyCSV(sampleCSV);
    
    showToast('サンプルデータを読み込みました。', 'success');
}

function exportCSV() {
    if (expBlocks.length === 0) {
        showToast('エクスポートするデータがありません。', 'error');
        return;
    }

    let csvContent = '\uFEFF'; // UTF-8 BOM
    
    // 1. Export Config Settings
    csvContent += '--- CONFIGURATION ---\n';
    csvContent += 'Key,Value\n';
    Object.keys(config).forEach(key => {
        csvContent += `${key},${config[key]}\n`;
    });
    csvContent += '\n';

    // 1.5 Export Rheology Data
    csvContent += '--- RHEOLOGY DATA ---\n';
    csvContent += 'Key,Value\n';
    csvContent += `rheologyDataJson,"${JSON.stringify(rheologyData).replace(/"/g, '""')}"\n`;
    csvContent += '\n';

    // 2. Export Experimental Blocks
    csvContent += '--- EXPERIMENTAL DATA ---\n';
    csvContent += 'BlockName,Time(s),N(rpm),T_raw(N.m),Tb_blank(N.m),n(1/s),P(W),Pv(W/m3),Re(-),Np(-),Fr(-)\n';
    
    const { rho, mu, d, DT, g, H } = config;
    const V = calcLiquidVolumeForPv(); // use measured V_act if set, else dish-corrected estimate


    expBlocks.forEach(b => {
        b.rows.forEach(row => {
            const n = row.N / 60;
            const T_net = row.T - row.Tb;
            const P = 2 * Math.PI * n * T_net;
            const Pv = P / V;
            const Re = calculateReVal(n);
            const Fr = calculateFrVal(n);
            
            let Np = 0;
            if (n > 0 && Math.abs(T_net) > 0) {
                Np = P / (rho * Math.pow(n, 3) * Math.pow(d, 5));
            }

            csvContent += `"${b.name}",${row.time},${row.N},${row.T},${row.Tb},${n.toFixed(3)},${P.toFixed(3)},${Pv.toFixed(1)},${Math.round(Re)},${Np.toFixed(3)},${Fr.toFixed(3)}\n`;
        });
    });

    // 3. Export Calculated Intermediate Variables
    csvContent += '\n';
    csvContent += '--- CALCULATED INTERMEDIATE VARIABLES ---\n';
    csvContent += 'Variable,Definition,Value\n';
    
    const vars = getKameiHiraokaIntermediateVars();
    const csvVarsRows = [
        { name: 'beta', def: '2ln(D/d) / (D/d - d/D)', val: vars.beta },
        { name: 'eta', def: '翼付近の循環流量比に関するパラメータ', val: vars.eta },
        { name: 'gamma', def: '流動モデルにおけるせん断幅の係数', val: vars.gamma },
        { name: 'X', def: '動力相関変数', val: vars.X },
        { name: 'Ct', def: '乱流時の形状項係数', val: vars.Ct },
        { name: 'm', def: '遷移域補正指数', val: vars.m },
        { name: 'Cu', def: '層流渦抵抗係数', val: vars.Cu },
        { name: 'f_infty', def: '極限摩擦係数', val: vars.f_infty },
        { name: 'CL', def: '層流抵抗の形状係数', val: vars.CL },
        { name: 'ReG_ratio', def: '流動モデルにおけるレイノルズ数比', val: vars.ReG_ratio },
        { name: 'NpMax', def: '完全邪魔板条件での最大動力数(段数補正済)', val: vars.NpMax }
    ];
    
    csvVarsRows.forEach(r => {
        csvContent += `"${r.name}","${r.def}",${r.val.toFixed(5)}\n`;
    });

    // 4. 完全浮遊速度 (Zwietering式)
    csvContent += '\n';
    csvContent += '--- COMPLETE SUSPENSION SPEED (Zwietering) ---\n';
    if (config.solidLiquidActive) {
        const njsRes = calculateNjs();
        if (!njsRes.error) {
            const dp_m = (config.dp_um ?? 150) * 1e-6;
            const S_val = config.sFactorMode === 'auto' ? getZwieteringPresetS() : (config.sFactorCustom ?? 5.0);
            csvContent += 'Variable,Definition,Value,Unit\n';
            csvContent += `"dp","粒子径",${dp_m.toExponential(4)},"m"\n`;
            csvContent += `"rho_S","粒子密度",${config.rho_S},"kg/m3"\n`;
            csvContent += `"delta_rho","密度差 (rhoS - rhoL)",${njsRes.delta_rho.toFixed(1)},"kg/m3"\n`;
            csvContent += `"nu","動粘度",${njsRes.nu.toExponential(4)},"m2/s"\n`;
            csvContent += `"X","粒子質量分率",${njsRes.X.toFixed(4)},"wt%"\n`;
            csvContent += `"S","Zwietering形状因子",${S_val.toFixed(2)},"-"\n`;
            csvContent += `"Njs","完全浮遊限界回転数",${njsRes.Njs_rps.toFixed(4)},"1/s"\n`;
            csvContent += `"Njs_rpm","完全浮遊限界回転数",${njsRes.Njs_rpm.toFixed(1)},"rpm"\n`;
            // Np and P at Njs
            const Re_Njs = (config.rho * njsRes.Njs_rps * Math.pow(config.d, 2)) / njsRes.mu;
            const { Np: Np_njs } = calculateNpCurve(Re_Njs);
            const P_njs = Np_njs * config.rho * Math.pow(njsRes.Njs_rps, 3) * Math.pow(config.d, 5);
            const V_njs = calcLiquidVolumeForPv();
            csvContent += `"Re_Njs","Njs時のレイノルズ数",${Re_Njs.toFixed(1)},"-"\n`;
            csvContent += `"Np_Njs","Njs時の動力数",${Np_njs.toFixed(4)},"-"\n`;
            csvContent += `"P_Njs","Njs時の攪拌所要動力",${P_njs.toFixed(4)},"W"\n`;
            csvContent += `"Pv_Njs","Njs時の単位体積動力",${(P_njs/V_njs).toFixed(2)},"W/m3"\n`;
        } else {
            csvContent += `# エラー: ${njsRes.error}\n`;
        }
    } else {
        csvContent += '# 固液分散が無効です\n';
    }

    // 5. Metzner-Otto (非ニュートン流体)
    csvContent += '\n';
    csvContent += '--- METZNER-OTTO (Non-Newtonian) ---\n';
    const isNonNewt = rheologyData.activeModel && rheologyData.activeModel !== 'newtonian';
    if (isNonNewt && Object.keys(rheologyData.samples).length > 0) {
        const modelsArr = rheologyData.samples[rheologyData.activeSample] || [];
        const mInfo = modelsArr.find(m => m.modelId === rheologyData.activeModel);
        csvContent += 'Variable,Definition,Value,Unit\n';
        csvContent += `"Sample","試料名","${rheologyData.activeSample}","-"\n`;
        csvContent += `"Model","レオロジーモデル","${mInfo ? mInfo.name : rheologyData.activeModel}","-"\n`;
        csvContent += `"ks","Metzner-Otto装置定数",${rheologyData.ks.toFixed(4)},"-"\n`;
        if (mInfo) {
            const p = mInfo.params;
            csvContent += `"R2","決定係数 R²",${mInfo.r2.toFixed(5)},"-"\n`;
            csvContent += `"RMSE","RMSE",${mInfo.rmse.toFixed(5)},"Pa"\n`;
            if (p.tau_y !== undefined) csvContent += `"tau_y","降伏応力",${p.tau_y.toFixed(5)},"Pa"\n`;
            if (p.eta_p !== undefined) csvContent += `"eta_p","塑性粘度 / Casson粘度",${p.eta_p.toFixed(5)},"Pa.s"\n`;
            if (p.K    !== undefined) csvContent += `"K","粘性係数",${p.K.toFixed(5)},"Pa.s^n"\n`;
            if (p.n    !== undefined) csvContent += `"n","流動指数",${p.n.toFixed(5)},"-"\n`;
            if (p.eta_0 !== undefined) csvContent += `"eta_0","ゼロせん断粘度",${p.eta_0.toFixed(5)},"Pa.s"\n`;
            if (p.eta_inf !== undefined) csvContent += `"eta_inf","無限せん断粘度",${p.eta_inf.toFixed(5)},"Pa.s"\n`;
            if (p.lambda !== undefined) csvContent += `"lambda","時定数 lambda",${p.lambda.toFixed(5)},"s"\n`;
        }
        // Per-block effective viscosity
        csvContent += `\n"Block","N_avg (rpm)","gamma_eff (1/s)","mu_eff (Pa.s)"\n`;
        expBlocks.forEach(b => {
            const n_rps = b.aveCalculated ? (b.aveCalculated.N / 60) : 0;
            const gamma_eff = rheologyData.ks * n_rps;
            const mu_eff = calcEffectiveViscosity(n_rps);
            csvContent += `"${b.name}",${(n_rps*60).toFixed(1)},${gamma_eff.toFixed(3)},${mu_eff.toFixed(6)}\n`;
        });
    } else {
        csvContent += '# 非ニュートン流体モデルが選択されていません\n';
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'agitator_exp_data.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('CSVエクスポートが完了しました。', 'success');
}

function importCSV(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        const lines = text.split('\n');
        
        let inConfig = false;
        let inData = false;
        let inRheology = false;
        
        let importedConfig = {};
        let importedBlocksMap = {};
        let importedRheology = null;

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            if (trimmed.startsWith('--- CONFIGURATION ---')) {
                inConfig = true; inData = false; inRheology = false; return;
            }
            if (trimmed.startsWith('--- RHEOLOGY DATA ---')) {
                inConfig = false; inData = false; inRheology = true; return;
            }
            if (trimmed.startsWith('--- EXPERIMENTAL DATA ---')) {
                inConfig = false; inData = true; inRheology = false; return;
            }
            if (trimmed.startsWith('---')) {
                inConfig = false; inData = false; inRheology = false; return;
            }

            if (inConfig || inRheology) {
                const firstComma = trimmed.indexOf(',');
                if (firstComma > 0) {
                    const key = trimmed.substring(0, firstComma).trim();
                    let val = trimmed.substring(firstComma + 1).trim();
                    
                    if (val.startsWith('"') && val.endsWith('"')) {
                        val = val.substring(1, val.length - 1).replace(/""/g, '"');
                    } else {
                        if (val === 'true') val = true;
                        else if (val === 'false') val = false;
                        else if (!isNaN(val) && val !== '') val = parseFloat(val);
                    }

                    if (inConfig) {
                        importedConfig[key] = val;
                    } else if (inRheology && key === 'rheologyDataJson') {
                        try {
                            importedRheology = JSON.parse(val);
                        } catch(e) { console.warn("Failed to parse rheology JSON", e); }
                    }
                }
            } else if (inData) {
                const parts = trimmed.split(',');
                if (parts.length >= 5) {
                    const blockName = parts[0].replace(/^"|"$/g, '').trim();
                    if (blockName === 'BlockName') return; // Header skip

                    const time = parseFloat(parts[1]) || 0;
                    const N = parseFloat(parts[2]) || 0;
                    const T = parseFloat(parts[3]) || 0;
                    const Tb = parseFloat(parts[4]) || 0;

                    if (!importedBlocksMap[blockName]) {
                        importedBlocksMap[blockName] = [];
                    }
                    importedBlocksMap[blockName].push({ time, N, T, Tb });
                }
            }
        });

        // Apply config
        if (Object.keys(importedConfig).length > 0) {
            config = { ...config, ...importedConfig };
            initInputs();
        }

        // Apply rheology
        if (importedRheology) {
            rheologyData = importedRheology;
            updateRheologyUI();
        }

        // Apply blocks
        if (Object.keys(importedBlocksMap).length > 0) {
            expBlocks = [];
            document.getElementById('blocks-container').innerHTML = '';
            
            Object.keys(importedBlocksMap).forEach(name => {
                const blockId = 'block-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
                const block = {
                    id: blockId,
                    name: name,
                    rows: importedBlocksMap[name]
                };
                expBlocks.push(block);
                renderBlockHTML(block);
            });
        }

        recalculateAll();
        showToast('CSVインポートが完了しました。', 'success');
    };
    reader.readAsText(file);
}

// Helper to draw a double-headed arrow on Canvas 2D
function drawCanvasArrow(ctx, x1, y1, x2, y2, color = '#0891b2', arrowSize = 6, doubleHeaded = true) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    // Line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrow heads
    const angle = Math.atan2(y2 - y1, x2 - x1);
    
    // Head at (x2, y2)
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - arrowSize * Math.cos(angle - Math.PI / 6), y2 - arrowSize * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - arrowSize * Math.cos(angle + Math.PI / 6), y2 - arrowSize * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    if (doubleHeaded) {
        // Head at (x1, y1)
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + arrowSize * Math.cos(angle - Math.PI / 6), y1 + arrowSize * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x1 + arrowSize * Math.cos(angle + Math.PI / 6), y1 + arrowSize * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

// Draw dynamic vessel schematic to offscreen canvas and output as PNG image to PDF template
function drawVesselForPDF() {
    const canvas = document.getElementById('pdfVesselCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 500, 600);

    const cx = 250;
    const w_vessel_px = 300;
    const scale = w_vessel_px / config.DT;

    const r_vessel = w_vessel_px / 2; // 150
    const lx = cx - r_vessel; // 100
    const rx = cx + r_vessel; // 400

    const y_top = 130;
    const y_cyl_bottom = 440;

    let hb_px = 0;
    if (config.headType === 'semi-elliptical') {
        hb_px = r_vessel / 2; // 75
    } else if (config.headType === 'dish') {
        hb_px = r_vessel * 0.388; // ~58
    } else if (config.headType === 'hemispherical') {
        hb_px = r_vessel; // 150
    } else {
        hb_px = 0;
    }

    const y_deepest = y_cyl_bottom + hb_px;

    // 1. Draw Liquid Volume (Back Layer)
    const h_liquid_px = config.H * scale;
    const y_liquid = y_deepest - h_liquid_px;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
    ctx.beginPath();
    ctx.moveTo(lx, y_liquid);
    ctx.lineTo(lx, y_cyl_bottom);
    if (config.headType === 'semi-elliptical') {
        ctx.ellipse(cx, y_cyl_bottom, r_vessel, hb_px, 0, Math.PI, 0, true);
    } else if (config.headType === 'dish') {
        const cr = 30;
        ctx.arc(lx + cr, y_cyl_bottom, cr, Math.PI, Math.PI / 2, true);
        ctx.ellipse(cx, y_cyl_bottom, r_vessel, hb_px * 1.2, 0, Math.PI / 2, Math.PI / 2, true); // approximate
        ctx.arc(rx - cr, y_cyl_bottom, cr, Math.PI / 2, 0, true);
    } else if (config.headType === 'hemispherical') {
        ctx.arc(cx, y_cyl_bottom, r_vessel, Math.PI, 0, true);
    } else {
        ctx.lineTo(rx, y_cyl_bottom);
    }
    ctx.lineTo(rx, y_liquid);
    ctx.closePath();
    ctx.fill();

    // Liquid surface line
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, y_liquid);
    ctx.lineTo(rx, y_liquid);
    ctx.stroke();
    ctx.restore();

    // 2. Draw Vessel Outline
    ctx.save();
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lx, y_top);
    ctx.lineTo(lx, y_cyl_bottom);
    if (config.headType === 'semi-elliptical') {
        ctx.ellipse(cx, y_cyl_bottom, r_vessel, hb_px, 0, Math.PI, 0, true);
    } else if (config.headType === 'dish') {
        // Approximate dish bottom corners
        const cr = 30;
        ctx.arc(lx + cr, y_cyl_bottom, cr, Math.PI, Math.PI / 2, true);
        ctx.ellipse(cx, y_cyl_bottom, r_vessel, hb_px * 1.2, 0, Math.PI / 2, Math.PI / 2, true);
        ctx.arc(rx - cr, y_cyl_bottom, cr, Math.PI / 2, 0, true);
    } else if (config.headType === 'hemispherical') {
        ctx.arc(cx, y_cyl_bottom, r_vessel, Math.PI, 0, true);
    } else {
        ctx.lineTo(rx, y_cyl_bottom);
    }
    ctx.lineTo(rx, y_top);
    ctx.stroke();

    // Top Lip / Flange
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(80, y_top - 30);
    ctx.lineTo(420, y_top - 30);
    ctx.stroke();

    // Nozzle
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(230, y_top - 50, 40, 20);
    ctx.beginPath();
    ctx.moveTo(220, y_top - 50);
    ctx.lineTo(280, y_top - 50);
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // 3. Draw Baffles
    const bw_px = config.Bw * scale;
    if (config.baffleActive) {
        ctx.save();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;

        // Set baffle height to 95% of the straight cylinder section, independent of liquid height
        const baffle_h = (y_cyl_bottom - y_top) * 0.95;
        const baffle_y_start = y_cyl_bottom - baffle_h;

        // Left
        ctx.fillRect(lx, baffle_y_start, bw_px, y_cyl_bottom - baffle_y_start);
        ctx.strokeRect(lx, baffle_y_start, bw_px, y_cyl_bottom - baffle_y_start);

        // Right
        if (parseInt(config.nB) > 1) {
            ctx.fillRect(rx - bw_px, baffle_y_start, bw_px, y_cyl_bottom - baffle_y_start);
            ctx.strokeRect(rx - bw_px, baffle_y_start, bw_px, y_cyl_bottom - baffle_y_start);
        }
        ctx.restore();
    }

    // 4. Draw Impeller Shaft
    const d_px = config.d * scale;
    const b_px = config.b * scale;
    const clearance_px = config.clearance * scale;
    const y_bottom_impeller = y_deepest - clearance_px - b_px/2;

    ctx.save();
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, y_top - 30);
    ctx.lineTo(cx, y_bottom_impeller);
    ctx.stroke();
    ctx.restore();

    // 5. Draw Impellers (Stages)
    // RULE: The bottom impeller is always anchored at clearance C above the tank bottom.
    //       Upper stages are stacked upward with a minimum gap of b*1.3.
    //       Bottom clearance is NEVER compromised.
    const n_stages = parseInt(config.n_stage) || 1;
    let stages_y = [];
    if (n_stages === 1) {
        stages_y.push(y_bottom_impeller);
    } else {
        // Ideal gap based on available span between clearance-top and liquid surface
        const y_top_impeller_limit = y_liquid + b_px/2;
        const available_span = y_bottom_impeller - y_top_impeller_limit;
        const ideal_gap = available_span / (n_stages - 1);
        // Enforce minimum gap to prevent visual overlap/merging of blades
        const stage_gap = Math.max(b_px * 1.3, ideal_gap);

        // Stack upward from the fixed bottom anchor (y_bottom_impeller)
        for (let i = 0; i < n_stages; i++) {
            stages_y.push(y_bottom_impeller - (i * stage_gap));
        }
    }

    stages_y.forEach(y_imp => {
        ctx.save();
        // Hub
        ctx.fillStyle = '#4b5563';
        ctx.fillRect(cx - 5, y_imp - b_px/2, 10, b_px);

        const blade_w = (d_px - 10) / 2;
        ctx.fillStyle = '#ec4899';
        ctx.strokeStyle = '#db2777';
        ctx.lineWidth = 1.5;

        if (config.impellerType === 'pitched-paddle') {
            // Left angled blade
            ctx.beginPath();
            ctx.moveTo(cx - 5, y_imp - b_px/3);
            ctx.lineTo(cx - 5 - blade_w, y_imp - b_px/2);
            ctx.lineTo(cx - 5 - blade_w, y_imp + b_px/6);
            ctx.lineTo(cx - 5, y_imp + b_px/3);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

            // Right angled blade
            ctx.beginPath();
            ctx.moveTo(cx + 5, y_imp - b_px/3);
            ctx.lineTo(cx + 5 + blade_w, y_imp - b_px/6);
            ctx.lineTo(cx + 5 + blade_w, y_imp + b_px/2);
            ctx.lineTo(cx + 5, y_imp + b_px/3);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

        } else if (config.impellerType === 'propeller') {
            // Left curve
            ctx.beginPath();
            ctx.moveTo(cx - 5, y_imp);
            ctx.bezierCurveTo(cx - 5 - blade_w/2, y_imp - b_px/2, cx - 5 - blade_w, y_imp - b_px/4, cx - 5 - blade_w, y_imp);
            ctx.bezierCurveTo(cx - 5 - blade_w, y_imp + b_px/2, cx - 5 - blade_w/2, y_imp, cx - 5, y_imp);
            ctx.fill(); ctx.stroke();

            // Right curve
            ctx.beginPath();
            ctx.moveTo(cx + 5, y_imp);
            ctx.bezierCurveTo(cx + 5 + blade_w/2, y_imp - b_px/2, cx + 5 + blade_w, y_imp - b_px/4, cx + 5 + blade_w, y_imp);
            ctx.bezierCurveTo(cx + 5 + blade_w, y_imp + b_px/2, cx + 5 + blade_w/2, y_imp, cx + 5, y_imp);
            ctx.fill(); ctx.stroke();

        } else if (config.impellerType === 'faudler') {
            // Left curve
            ctx.beginPath();
            ctx.moveTo(cx - 5, y_imp - b_px/4);
            ctx.quadraticCurveTo(cx - 5 - blade_w/2, y_imp - b_px/2, cx - 5 - blade_w, y_imp);
            ctx.lineTo(cx - 5 - blade_w, y_imp + b_px/2);
            ctx.quadraticCurveTo(cx - 5 - blade_w/2, y_imp + b_px/4, cx - 5, y_imp + b_px/4);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

            // Right curve
            ctx.beginPath();
            ctx.moveTo(cx + 5, y_imp - b_px/4);
            ctx.quadraticCurveTo(cx + 5 + blade_w/2, y_imp - b_px/2, cx + 5 + blade_w, y_imp);
            ctx.lineTo(cx + 5 + blade_w, y_imp + b_px/2);
            ctx.quadraticCurveTo(cx + 5 + blade_w/2, y_imp + b_px/4, cx + 5, y_imp + b_px/4);
            ctx.closePath();
            ctx.fill(); ctx.stroke();

        } else {
            // Flat paddle / turbine (rectangles)
            ctx.fillRect(cx - 5 - blade_w, y_imp - b_px/2, blade_w, b_px);
            ctx.strokeRect(cx - 5 - blade_w, y_imp - b_px/2, blade_w, b_px);

            ctx.fillRect(cx + 5, y_imp - b_px/2, blade_w, b_px);
            ctx.strokeRect(cx + 5, y_imp - b_px/2, blade_w, b_px);
        }

        if (config.impellerType === 'flat-turbine') {
            ctx.fillStyle = '#9ca3af';
            ctx.strokeStyle = '#4b5563';
            ctx.lineWidth = 1;
            ctx.fillRect(cx - d_px * 0.37, y_imp - 2, d_px * 0.74, 4);
            ctx.strokeRect(cx - d_px * 0.37, y_imp - 2, d_px * 0.74, 4);
        }
        ctx.restore();
    });

    // 6. Draw Dimension Guides, Arrows and Labels
    ctx.save();
    ctx.strokeStyle = '#0891b2';
    ctx.fillStyle = '#0891b2';
    ctx.font = "bold 13px 'Outfit', 'Inter', sans-serif";

    // Guide lines styling
    const setGuideStyle = () => {
        ctx.strokeStyle = '#0891b2';
        ctx.lineWidth = 1.0;
        ctx.setLineDash([3, 3]);
    };

    // DT (Vessel Diameter)
    setGuideStyle();
    ctx.beginPath();
    ctx.moveTo(lx, y_cyl_bottom);
    ctx.lineTo(lx, y_deepest + 55);
    ctx.moveTo(rx, y_cyl_bottom);
    ctx.lineTo(rx, y_deepest + 55);
    ctx.stroke();

    ctx.setLineDash([]); // solid
    drawCanvasArrow(ctx, lx, y_deepest + 45, rx, y_deepest + 45);
    ctx.textAlign = 'center';
    ctx.fillText(`DT = ${config.DT.toFixed(3)} m`, cx, y_deepest + 38);

    // H (Liquid height)
    setGuideStyle();
    ctx.beginPath();
    ctx.moveTo(rx, y_liquid);
    ctx.lineTo(460, y_liquid);
    ctx.moveTo(cx, y_deepest);
    ctx.lineTo(460, y_deepest);
    ctx.stroke();

    ctx.setLineDash([]);
    drawCanvasArrow(ctx, 450, y_liquid, 450, y_deepest);
    
    // Vertical text rotation
    ctx.save();
    ctx.translate(458, (y_liquid + y_deepest) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(`H = ${config.H.toFixed(3)} m`, 0, 0);
    ctx.restore();

    // d (Impeller Diameter)
    const y_d_line = y_bottom_impeller - b_px - 20;
    setGuideStyle();
    ctx.beginPath();
    ctx.moveTo(cx - d_px/2, y_bottom_impeller);
    ctx.lineTo(cx - d_px/2, y_d_line - 10);
    ctx.moveTo(cx + d_px/2, y_bottom_impeller);
    ctx.lineTo(cx + d_px/2, y_d_line - 10);
    ctx.stroke();

    ctx.setLineDash([]);
    drawCanvasArrow(ctx, cx - d_px/2, y_d_line, cx + d_px/2, y_d_line);
    ctx.textAlign = 'center';
    ctx.fillText(`d = ${config.d.toFixed(3)} m`, cx, y_d_line - 6);

    // C (Clearance)
    ctx.setLineDash([]);
    const y_c_start_pdf = y_bottom_impeller + b_px/2;
    drawCanvasArrow(ctx, cx + 25, y_c_start_pdf, cx + 25, y_deepest);
    ctx.textAlign = 'left';
    ctx.fillText(`C = ${config.clearance.toFixed(3)} m`, cx + 35, (y_c_start_pdf + y_deepest) / 2 + 4);

    // b (Blade width)
    const x_b_line = cx + d_px/2 + 25;
    drawCanvasArrow(ctx, x_b_line, y_bottom_impeller - b_px/2, x_b_line, y_bottom_impeller + b_px/2);
    ctx.textAlign = 'left';
    ctx.fillText(`b = ${config.b.toFixed(3)} m`, x_b_line + 10, y_bottom_impeller + 4);

    // Bw (Baffle Width)
    if (config.baffleActive) {
        drawCanvasArrow(ctx, lx, y_top - 15, lx + bw_px, y_top - 15);
        ctx.textAlign = 'center';
        ctx.fillText(`Bw=${config.Bw.toFixed(3)}m`, lx + bw_px/2, y_top - 23);
    }
    ctx.restore();

    // Output directly to PNG Image source in template
    const imgEl = document.getElementById('pdf-vessel-img');
    if (imgEl) {
        imgEl.src = canvas.toDataURL('image/png');
    }
}

// Generate PDF Report using html2pdf.js
function generatePDFReport() {
    if (!chart) {
        showToast('グラフが初期化されていません。', 'error');
        return;
    }

    // Draw the latest vessel dimensions Canvas for PDF (direct PNG export)
    drawVesselForPDF();
    document.getElementById('pdf-exp-number').textContent = config.expNumber || '-';
    document.getElementById('pdf-exp-date').textContent = config.expDate || '-';
    document.getElementById('pdf-exp-author').textContent = config.expAuthor || '-';

    // 2. Fill Conditions
    document.getElementById('pdf-val-g').textContent = config.g.toFixed(3);
    document.getElementById('pdf-val-temp').textContent = config.liquidTemp.toFixed(1);
    document.getElementById('pdf-val-rho').textContent = config.rho.toFixed(1);
    document.getElementById('pdf-val-mu').textContent = config.mu.toFixed(4);

    document.getElementById('pdf-val-dt').textContent = config.DT.toFixed(3);
    document.getElementById('pdf-val-h').textContent = config.H.toFixed(3);
    
    // Map bottom head type
    const headMap = {
        'flat': '平底',
        'semi-elliptical': '半楕円形',
        'dish': '皿型',
        'hemispherical': '全半球形'
    };
    document.getElementById('pdf-val-head').textContent = headMap[config.headType] || config.headType;

    // Map impeller type
    const impellerMap = {
        'pitched-paddle': '傾斜パドル',
        'flat-paddle': '平板パドル',
        'flat-turbine': '平板タービン',
        'propeller': 'プロペラ',
        'faudler': 'ファウドラー'
    };
    document.getElementById('pdf-val-impeller').textContent = impellerMap[config.impellerType] || config.impellerType;
    document.getElementById('pdf-val-np').textContent = config.np;
    document.getElementById('pdf-val-theta').textContent = config.theta;
    document.getElementById('pdf-val-d').textContent = config.d.toFixed(3);
    document.getElementById('pdf-val-b').textContent = config.b.toFixed(3);
    document.getElementById('pdf-val-stages').textContent = config.n_stage;

    document.getElementById('pdf-val-baffle').textContent = config.baffleActive ? 'あり' : 'なし';
    document.getElementById('pdf-val-nb').textContent = config.nB;
    document.getElementById('pdf-val-bw').textContent = config.Bw.toFixed(3);

    // Solid-Liquid data mapping for PDF
    const slSection = document.getElementById('pdf-solid-liquid-section');
    if (config.solidLiquidActive) {
        slSection.style.display = 'block';
        document.getElementById('pdf-val-dp').textContent = config.dp_um;
        document.getElementById('pdf-val-rhos').textContent = config.rho_S;
        
        let S = 5.0;
        if (config.sFactorMode === 'auto') {
            S = getZwieteringPresetS();
        } else {
            S = config.sFactorCustom ?? 5.0;
        }
        document.getElementById('pdf-val-sfactor').textContent = S.toFixed(2);
        
        // Calculate Njs values directly for full detail
        const njsRes = calculateNjs();
        if (!njsRes.error) {
            document.getElementById('pdf-val-deltarho').textContent = Math.round(njsRes.delta_rho) + ' kg/m³';
            document.getElementById('pdf-val-nu').textContent = njsRes.nu.toExponential(3) + ' m²/s';
            document.getElementById('pdf-val-xwt').textContent = njsRes.X.toFixed(3);
            document.getElementById('pdf-val-njs').textContent = Math.round(njsRes.Njs_rpm);
            // Re, Np, P, Pv at Njs
            const Re_njs = (config.rho * njsRes.Njs_rps * Math.pow(config.d, 2)) / njsRes.mu;
            const { Np: Np_njs_pdf } = calculateNpCurve(Re_njs);
            const P_njs_pdf = Np_njs_pdf * config.rho * Math.pow(njsRes.Njs_rps, 3) * Math.pow(config.d, 5);
            const Pv_njs_pdf = P_njs_pdf / calcLiquidVolumeForPv();
            document.getElementById('pdf-val-re-njs').textContent = Math.round(Re_njs).toLocaleString();
            document.getElementById('pdf-val-np-njs').textContent = Np_njs_pdf.toFixed(3);
            document.getElementById('pdf-val-pnjs').textContent = P_njs_pdf.toFixed(3);
            document.getElementById('pdf-val-pvnjs').textContent = Pv_njs_pdf.toFixed(1);
        } else {
            document.getElementById('pdf-val-xwt').textContent = document.getElementById('sim-res-X').textContent.replace(' wt%', '');
            document.getElementById('pdf-val-njs').textContent = '--';
            document.getElementById('pdf-val-pnjs').textContent = '--';
        }
    } else {
        slSection.style.display = 'none';
    }

    // 3. Render Light Mode Chart on Hidden Canvas
    const pdfCanvas = document.getElementById('pdfChartCanvas');
    const pdfCtx = pdfCanvas.getContext('2d');
    
    // Custom plugins for Light Mode PDF Chart
    const lightChartAreaBorder = {
        id: 'lightChartAreaBorder',
        afterDraw(c) {
            const {ctx: cCtx, chartArea: {top, right, bottom, left, width, height}} = c;
            cCtx.save();
            cCtx.strokeStyle = '#4b5563'; // Darker gray frame for clear boundary
            cCtx.lineWidth = 1.5;
            cCtx.strokeRect(left, top, width, height);
            cCtx.restore();
        }
    };

    const customCanvasBackgroundColor = {
        id: 'customCanvasBackgroundColor',
        beforeDraw(c) {
            const {ctx: cCtx} = c;
            cCtx.save();
            cCtx.globalCompositeOperation = 'destination-over';
            cCtx.fillStyle = '#ffffff'; // Force solid white background
            cCtx.fillRect(0, 0, c.width, c.height);
            cCtx.restore();
        }
    };

    // Deep copy datasets from current chart and adjust for print colors (light mode)
    const originalDatasets = chart.data.datasets;
    const lightDatasets = originalDatasets.map(ds => {
        const copy = JSON.parse(JSON.stringify(ds));
        if (copy.label.includes('NpMax')) {
            copy.borderColor = '#dc2626'; // High-contrast Red
        } else if (copy.label.includes('Np0')) {
            copy.borderColor = '#d97706'; // High-contrast Amber/Orange
        } else if (copy.label.includes('Np')) {
            copy.borderColor = '#0284c7'; // High-contrast Blue
        } else if (copy.label.includes('実験データ') || copy.label.includes('実測値')) {
            copy.backgroundColor = '#059669'; // High-contrast Emerald
            copy.borderColor = '#111827'; // Solid Dark boundary for dots
        } else if (copy.label.includes('Njs')) {
            copy.backgroundColor = '#dc2626'; // High-contrast Red dot
            copy.borderColor = '#111827';
        }
        return copy;
    });

    const pdfChart = new Chart(pdfCtx, {
        type: 'scatter',
        data: {
            datasets: lightDatasets
        },
        plugins: [lightChartAreaBorder, customCanvasBackgroundColor, lightChartRegions, lightChartNjsLabel],
        options: {
            responsive: false,
            devicePixelRatio: 2, // High resolution export
            animation: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#111827', // Black legend text
                        font: { family: 'Inter', size: 10 }
                    }
                }
            },
            scales: {
                x: {
                    type: 'logarithmic',
                    title: {
                        display: true,
                        text: 'レイノルズ数 Re [-]',
                        color: '#111827',
                        font: { family: 'Outfit', size: 12, weight: 600 }
                    },
                    border: { display: true, color: '#4b5563', width: 1.5 },
                    grid: {
                        color: function(context) {
                            if (!context.tick) return 'rgba(0, 0, 0, 0.02)';
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return 'rgba(0, 0, 0, 0.15)'; // Major gridline
                            }
                            return 'rgba(0, 0, 0, 0.05)'; // Minor gridline
                        },
                        lineWidth: function(context) {
                            if (!context.tick) return 1;
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) return 1.0;
                            return 0.6;
                        },
                        tickColor: function(context) {
                            if (!context.tick) return 'rgba(0, 0, 0, 0.05)';
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) return 'rgba(0, 0, 0, 0.3)';
                            return 'rgba(0, 0, 0, 0.1)';
                        },
                        tickLength: function(context) {
                            if (!context.tick) return 6;
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) return 8;
                            return 4;
                        }
                    },
                    ticks: {
                        color: '#374151',
                        callback: function(value) {
                            const log10 = Math.log10(value);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return '10' + getSuperScript(Math.round(log10));
                            }
                            return '';
                        }
                    },
                    afterBuildTicks: function(scale) {
                        const ticks = [];
                        const minVal = (scale.min !== undefined && scale.min !== null && !isNaN(scale.min)) ? scale.min : ((scale.dataMin !== undefined && scale.dataMin !== null) ? scale.dataMin : 0.1);
                        const maxVal = (scale.max !== undefined && scale.max !== null && !isNaN(scale.max)) ? scale.max : ((scale.dataMax !== undefined && scale.dataMax !== null) ? scale.dataMax : 100000);
                        const minLog = Math.floor(Math.log10(minVal));
                        const maxLog = Math.ceil(Math.log10(maxVal));
                        for (let log = minLog; log <= maxLog; log++) {
                            const base = Math.pow(10, log);
                            for (let i = 1; i <= 9; i++) {
                                const val = base * i;
                                if (val >= minVal && val <= maxVal) {
                                    ticks.push({ value: val, major: (i === 1) });
                                }
                            }
                        }
                        scale.ticks = ticks;
                    },
                    min: chart.options.scales.x.min,
                    max: chart.options.scales.x.max
                },
                y: {
                    type: 'logarithmic',
                    title: {
                        display: true,
                        text: '動力数 Np [-]',
                        color: '#111827',
                        font: { family: 'Outfit', size: 12, weight: 600 }
                    },
                    border: { display: true, color: '#4b5563', width: 1.5 },
                    grid: {
                        color: function(context) {
                            if (!context.tick) return 'rgba(0, 0, 0, 0.02)';
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return 'rgba(0, 0, 0, 0.15)'; // Major gridline
                            }
                            return 'rgba(0, 0, 0, 0.05)'; // Minor gridline
                        },
                        lineWidth: function(context) {
                            if (!context.tick) return 1;
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) return 1.0;
                            return 0.6;
                        },
                        tickColor: function(context) {
                            if (!context.tick) return 'rgba(0, 0, 0, 0.05)';
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) return 'rgba(0, 0, 0, 0.3)';
                            return 'rgba(0, 0, 0, 0.1)';
                        },
                        tickLength: function(context) {
                            if (!context.tick) return 6;
                            const val = context.tick.value;
                            const log10 = Math.log10(val);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) return 8;
                            return 4;
                        }
                    },
                    ticks: {
                        color: '#374151',
                        callback: function(value) {
                            const log10 = Math.log10(value);
                            if (Math.abs(log10 - Math.round(log10)) < 1e-10) {
                                return '10' + getSuperScript(Math.round(log10));
                            }
                            return '';
                        }
                    },
                    afterBuildTicks: function(scale) {
                        const ticks = [];
                        const minVal = (scale.min !== undefined && scale.min !== null && !isNaN(scale.min)) ? scale.min : ((scale.dataMin !== undefined && scale.dataMin !== null) ? scale.dataMin : 0.01);
                        const maxVal = (scale.max !== undefined && scale.max !== null && !isNaN(scale.max)) ? scale.max : ((scale.dataMax !== undefined && scale.dataMax !== null) ? scale.dataMax : 100);
                        const minLog = Math.floor(Math.log10(minVal));
                        const maxLog = Math.ceil(Math.log10(maxVal));
                        for (let log = minLog; log <= maxLog; log++) {
                            const base = Math.pow(10, log);
                            for (let i = 1; i <= 9; i++) {
                                const val = base * i;
                                if (val >= minVal && val <= maxVal) {
                                    ticks.push({ value: val, major: (i === 1) });
                                }
                            }
                        }
                        scale.ticks = ticks;
                    },
                    min: chart.options.scales.y.min,
                    max: chart.options.scales.y.max
                }
            }
        }
    });

    const chartImgUrl = pdfChart.toBase64Image();
    document.getElementById('pdf-chart-img').src = chartImgUrl;
    
    // Clean up temporary chart instance
    pdfChart.destroy();

    // 3.5 Fill PDF Calculated Intermediate Variables
    const pdfVarsBody = document.getElementById('pdf-calculated-vars-body');
    pdfVarsBody.innerHTML = '';
    
    const vars = getKameiHiraokaIntermediateVars();
    const pdfVarsRows = [
        { name: 'β (ベータ)', def: '2ln(D/d) / (D/d - d/D)', val: vars.beta },
        { name: 'η (イータ)', def: '翼付近の循環流量比に関するパラメータ', val: vars.eta },
        { name: 'γ (ガンマ)', def: '流動モデルにおけるせん断幅の係数', val: vars.gamma },
        { name: 'X', def: '動力相関変数', val: vars.X },
        { name: 'Ct', def: '乱流時の形状項係数', val: vars.Ct },
        { name: 'm', def: '遷移域補正指数', val: vars.m },
        { name: 'Cu', def: '層流渦抵抗係数', val: vars.Cu },
        { name: 'f_∞', def: '極限摩擦係数', val: vars.f_infty },
        { name: 'CL', def: '層流抵抗の形状係数', val: vars.CL },
        { name: 'ReG / Re', def: '流動モデルにおけるレイノルズ数比', val: vars.ReG_ratio },
        { name: 'NpMax (段数補正済)', def: '完全邪魔板条件での最大動力数', val: vars.NpMax }
    ];

    pdfVarsRows.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding: 5px; border: 1px solid #e5e7eb; font-weight: 500;">${r.name}</td>
            <td style="padding: 5px; border: 1px solid #e5e7eb; color: #4b5563; font-size: 8px;">${r.def}</td>
            <td style="padding: 5px; border: 1px solid #e5e7eb; text-align: right; font-family: monospace; font-weight: 600; color: #0284c7;">${r.val.toFixed(5)}</td>
        `;
        pdfVarsBody.appendChild(tr);
    });

    // Liquid volume row in PDF
    const V_liq = calcLiquidVolume();
    const V_liq_mL = V_liq * 1e6;
    const headLabelMap = { 'flat': '平底', 'semi-elliptical': '半楕円形(2:1)', 'dish': '皿型', 'hemispherical': '全半球形' };
    const headLabelPdf = headLabelMap[config.headType] || config.headType;
    const trVpdf = document.createElement('tr');
    trVpdf.innerHTML = `
        <td style="padding: 5px; border: 1px solid #e5e7eb; font-weight: 500;">V<sub>液</sub> (概算)</td>
        <td style="padding: 5px; border: 1px solid #e5e7eb; color: #4b5563; font-size: 8px;">液体積の概算値（鏡板：${headLabelPdf}）</td>
        <td style="padding: 5px; border: 1px solid #e5e7eb; text-align: right; font-family: monospace; font-weight: 600; color: #0284c7;">${V_liq.toExponential(4)} m³ &nbsp;(${V_liq_mL.toFixed(1)} mL)</td>
    `;
    pdfVarsBody.appendChild(trVpdf);

    // 3.5 Non-Newtonian Information
    const pdfNonNewtSection = document.getElementById('pdf-non-newtonian-section');
    const pdfNonNewtContent = document.getElementById('pdf-non-newtonian-content');
    
    if (rheologyData.activeModel && rheologyData.activeModel !== 'newtonian') {
        const models = rheologyData.samples[rheologyData.activeSample] || [];
        const modelInfo = models.find(m => m.modelId === rheologyData.activeModel);
        
        if (modelInfo) {
            let formulaStr = '';
            let paramStr = '';
            const p = modelInfo.params;
            
            if (rheologyData.activeModel === 'bingham') {
                formulaStr = `τ = τ<sub>y</sub> + η<sub>p</sub> D`;
                paramStr = `降伏値 τ<sub>y</sub> = ${p.tau_y ? p.tau_y.toFixed(4) : 0} Pa, 塑性粘度 η<sub>p</sub> = ${p.eta_p ? p.eta_p.toFixed(4) : 0} Pa·s`;
            } else if (rheologyData.activeModel === 'casson') {
                formulaStr = `√τ = √τ<sub>y</sub> + √η<sub>c</sub> √D`;
                paramStr = `Casson降伏値 τ<sub>y</sub> = ${p.tau_y ? p.tau_y.toFixed(4) : 0} Pa, Casson粘度 η<sub>c</sub> = ${p.eta_p ? p.eta_p.toFixed(4) : 0} Pa·s`;
            } else if (rheologyData.activeModel === 'powerlaw') {
                formulaStr = `τ = K D<sup>n</sup>`;
                paramStr = `粘性係数 K = ${p.K ? p.K.toFixed(4) : 0} Pa·s<sup>n</sup>, 流動指数 n = ${p.n ? p.n.toFixed(4) : 0}`;
            } else if (rheologyData.activeModel === 'hb') {
                formulaStr = `τ = τ<sub>y</sub> + K D<sup>n</sup>`;
                paramStr = `降伏値 τ<sub>y</sub> = ${p.tau_y ? p.tau_y.toFixed(4) : 0} Pa, 粘性係数 K = ${p.K ? p.K.toFixed(4) : 0} Pa·s<sup>n</sup>, 流動指数 n = ${p.n ? p.n.toFixed(4) : 0}`;
            }
            
            let allN_pdf = [];
            expBlocks.forEach(b => b.rows.forEach(r => { if (r.N > 0) allN_pdf.push(r.N / 60); }));
            const n_rep_pdf = allN_pdf.length > 0 ? allN_pdf.reduce((a, b) => a + b, 0) / allN_pdf.length : 100 / 60;
            const mu_eff_rep = calcEffectiveViscosity(n_rep_pdf);
            
            pdfNonNewtContent.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <div><strong style="color:#0f172a;">適合モデル:</strong> ${modelInfo.name}</div>
                    <div><strong style="color:#0f172a;">適合度 R²:</strong> ${modelInfo.r2 ? modelInfo.r2.toFixed(4) : '-'}</div>
                </div>
                <div style="margin-bottom:8px; font-family: monospace; font-size:11px; background:#e2e8f0; padding:6px; border-radius:4px;">
                    <strong>適用式:</strong> ${formulaStr}
                </div>
                <div style="margin-bottom:12px; color:#475569;">[パラメータ] ${paramStr}</div>
                <div style="border-top: 1px dashed #cbd5e1; padding-top: 8px;">
                    <div style="margin-bottom:4px;"><strong style="color:#0f172a;">Metzner-Otto法 定数と代表値</strong></div>
                    <ul style="margin:0; padding-left:16px; color:#334155;">
                        <li>装置定数 k<sub>s</sub> = ${rheologyData.ks.toFixed(2)}</li>
                        <li>有効せん断速度式: &gamma;<sub>eff</sub> = k<sub>s</sub> × N &nbsp;[1/s]</li>
                        <li>代表有効粘度 (N ≈ ${(n_rep_pdf*60).toFixed(0)} rpm時): &mu;<sub>eff</sub> ≈ ${mu_eff_rep.toFixed(5)} Pa·s</li>
                    </ul>
                </div>
                <div style="border-top: 1px dashed #cbd5e1; padding-top: 8px; margin-top: 8px;">
                    <div style="margin-bottom:4px;"><strong style="color:#0f172a;">各測定ブロックの有効粘度（Metzner-Otto法）</strong></div>
                    <table style="width:100%; border-collapse:collapse; font-size:9px;">
                        <thead>
                            <tr style="background:#e2e8f0; text-align:center; font-weight:600;">
                                <th style="padding:3px 6px; border:1px solid #cbd5e1; text-align:left;">ブロック名</th>
                                <th style="padding:3px 6px; border:1px solid #cbd5e1;">N (rpm)</th>
                                <th style="padding:3px 6px; border:1px solid #cbd5e1;">&gamma;<sub>eff</sub> = k<sub>s</sub>N (1/s)</th>
                                <th style="padding:3px 6px; border:1px solid #cbd5e1;">&mu;<sub>eff</sub> (Pa·s)</th>
                                <th style="padding:3px 6px; border:1px solid #cbd5e1;">Re<sub>eff</sub> [-]</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${expBlocks.map(b => {
                                const n_rps_b = b.aveCalculated ? (b.aveCalculated.N / 60) : 0;
                                const gamma_eff_b = rheologyData.ks * n_rps_b;
                                const mu_eff_b = calcEffectiveViscosity(n_rps_b);
                                const Re_eff_b = mu_eff_b > 0 ? (config.rho * n_rps_b * config.d * config.d / mu_eff_b) : 0;
                                return `<tr style="text-align:center;">
                                    <td style="padding:3px 6px; border:1px solid #e5e7eb; text-align:left; font-weight:500;">${b.name}</td>
                                    <td style="padding:3px 6px; border:1px solid #e5e7eb; font-family:monospace;">${(n_rps_b*60).toFixed(1)}</td>
                                    <td style="padding:3px 6px; border:1px solid #e5e7eb; font-family:monospace;">${gamma_eff_b.toFixed(2)}</td>
                                    <td style="padding:3px 6px; border:1px solid #e5e7eb; font-family:monospace; color:#0284c7; font-weight:600;">${mu_eff_b.toFixed(5)}</td>
                                    <td style="padding:3px 6px; border:1px solid #e5e7eb; font-family:monospace;">${Math.round(Re_eff_b).toLocaleString()}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            pdfNonNewtSection.style.display = 'block';
        } else {
            pdfNonNewtSection.style.display = 'none';
        }
    } else {
        pdfNonNewtSection.style.display = 'none';
    }

    // 4. Fill Table Data (Averages of blocks)
    const tbody = document.getElementById('pdf-results-tbody');
    tbody.innerHTML = '';

    if (expBlocks.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="7" style="padding: 10px; color: #6b7280; border: 1px solid #e5e7eb;">実験データブロックが登録されていません。</td>`;
        tbody.appendChild(tr);
    } else {
        expBlocks.forEach(b => {
            const tr = document.createElement('tr');
            const reVal = b.aveCalculated ? b.aveCalculated.Re : 0;
            const npVal = b.aveCalculated ? b.aveCalculated.Np : 0;
            const frVal = b.aveCalculated ? b.aveCalculated.Fr : 0;
            const nVal = b.aveCalculated ? b.aveCalculated.N : 0;
            const pVal = b.aveCalculated ? b.aveCalculated.P : 0;
            const pvVal = b.aveCalculated ? b.aveCalculated.Pv : 0;

            tr.innerHTML = `
                <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: left; font-weight: 500;">${b.name}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${nVal.toFixed(1)}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; font-family: monospace;">${pVal.toFixed(3)}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; font-family: monospace;">${pvVal.toFixed(1)}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; font-family: monospace;">${Math.round(reVal)}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; font-family: monospace;">${npVal.toFixed(3)}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb; font-family: monospace;">${frVal.toFixed(3)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 5. Run html2pdf
    const element = document.getElementById('pdf-report-template');
    
    // Display temporarily to let html2pdf render correctly
    element.style.display = 'block';

    const opt = {
        margin:       15, // standard margin
        filename:     `攪拌槽動力特性レポート_${config.expNumber || 'EXP'}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    showToast('PDF生成中...', 'info');

    // Give the browser 250ms to render the newly-shown SVG inside the block element
    setTimeout(() => {
        html2pdf().set(opt).from(element).save().then(() => {
            element.style.display = 'none';
            showToast('PDFレポートがダウンロードされました。', 'success');
        }).catch(err => {
            element.style.display = 'none';
            showToast('PDF生成中にエラーが発生しました。', 'error');
            console.error(err);
        });
    }, 250);
}

// Load Preset List from localStorage
function loadPresetList() {
    const presetSelect = document.getElementById('preset-select');
    presetSelect.innerHTML = '<option value="">-- 実験プリセット選択 --</option>';

    let presets = [];
    try {
        presets = JSON.parse(localStorage.getItem('agitator_presets')) || [];
    } catch (e) {
        console.error("Failed to parse presets from localStorage", e);
    }

    presets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        presetSelect.appendChild(opt);
    });

    document.getElementById('load-preset-btn').disabled = true;
    document.getElementById('delete-preset-btn').disabled = true;
}

// Save Current Configuration as Preset to localStorage
function savePreset(name) {
    let presets = [];
    try {
        presets = JSON.parse(localStorage.getItem('agitator_presets')) || [];
    } catch (e) {
        presets = [];
    }

    // Parameters to exclude from preset (experiment metadata)
    const excludeKeys = ['expNumber', 'expDate', 'expAuthor'];
    const presetConfig = {};

    Object.keys(config).forEach(key => {
        if (!excludeKeys.includes(key)) {
            presetConfig[key] = config[key];
        }
    });

    const existingIdx = presets.findIndex(p => p.name === name);
    if (existingIdx !== -1) {
        if (!confirm(`プリセット "${name}" は既に存在します。上書きしますか？`)) {
            return;
        }
        presets[existingIdx].config = presetConfig;
    } else {
        presets.push({ name, config: presetConfig });
    }

    try {
        localStorage.setItem('agitator_presets', JSON.stringify(presets));
        showToast(`プリセット "${name}" を保存しました。`, 'success');
        loadPresetList();
        // Select the newly saved preset
        document.getElementById('preset-select').value = name;
        document.getElementById('load-preset-btn').disabled = false;
        document.getElementById('delete-preset-btn').disabled = false;
    } catch (e) {
        showToast('プリセットの保存に失敗しました（容量制限など）。', 'error');
    }
}

// Load Configuration from Named Preset
function loadPreset(name) {
    let presets = [];
    try {
        presets = JSON.parse(localStorage.getItem('agitator_presets')) || [];
    } catch (e) {
        return;
    }

    const preset = presets.find(p => p.name === name);
    if (!preset) {
        showToast(`プリセット "${name}" が見つかりません。`, 'error');
        return;
    }

    // Apply preset values to current configuration
    Object.keys(preset.config).forEach(key => {
        config[key] = preset.config[key];
    });

    // Sync UI fields
    initInputs();
    switchMainTab(config.activeTab || 'rushton');
    recalculateAll();
    showToast(`プリセット "${name}" を読み込みました。`, 'success');
}

// Delete Named Preset from localStorage
function deletePreset(name) {
    let presets = [];
    try {
        presets = JSON.parse(localStorage.getItem('agitator_presets')) || [];
    } catch (e) {
        return;
    }

    const filtered = presets.filter(p => p.name !== name);
    try {
        localStorage.setItem('agitator_presets', JSON.stringify(filtered));
        showToast(`プリセット "${name}" を削除しました。`, 'success');
        loadPresetList();
    } catch (e) {
        showToast('プリセットの削除に失敗しました。', 'error');
    }
}

// Save current application state to localStorage for persistence across reloads
function saveCurrentState() {
    try {
        const state = {
            config: config,
            expBlocks: expBlocks,
            rheologyData: rheologyData
        };
        localStorage.setItem('agitator_current_state', JSON.stringify(state));
    } catch (e) {
        console.error("Failed to save current state to localStorage", e);
    }
}

// -----------------------------------------------------------
// Solid-Liquid Particle Suspension (Zwietering Njs) Calculations
// -----------------------------------------------------------

function updateSolidConcLabel() {
    const label = document.getElementById('solid-conc-label');
    if (!label) return;
    if (config.solidConcMode === 'wt-ratio') {
        label.innerHTML = '固体濃度 X (wt% (対液)) <span style="font-size:0.7rem;opacity:0.6;">(質量比×100)</span>';
    } else {
        label.innerHTML = '全体重量濃度 w (wt% (全体)) <span style="font-size:0.7rem;opacity:0.6;">(全懸濁液基準)</span>';
    }
}

function toggleSFactorCustom() {
    const container = document.getElementById('s-factor-custom-container');
    if (!container) return;
    if (config.solidLiquidActive && config.sFactorMode === 'custom') {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }
}

function getZwieteringPresetS() {
    const { impellerType, headType } = config;
    const isFlatBottom = headType === 'flat';
    if (isFlatBottom) {
        switch (impellerType) {
            case 'flat-turbine': return 7.0;
            case 'flat-paddle': return 7.5;
            case 'pitched-paddle': return 5.0;
            case 'propeller': return 9.0;
            case 'faudler': return 7.0;
            default: return 7.0;
        }
    } else {
        // Dished bottom
        switch (impellerType) {
            case 'flat-turbine': return 5.2;
            case 'flat-paddle': return 5.6;
            case 'pitched-paddle': return 4.6;
            case 'propeller': return 8.2;
            case 'faudler': return 6.0;
            default: return 6.0;
        }
    }
}

function calculateNjs() {
    const dp = (config.dp_um ?? 150) * 1e-6; // μm -> m
    const rhoS = config.rho_S ?? 2500;
    const rhoL = config.rho;
    const delta_rho = rhoS - rhoL;
    
    if (delta_rho <= 0) {
        return {
            error: "粒子密度が液密度以下です（浮上または中性浮遊）",
            Njs_rpm: 0,
            Njs_rps: 0,
            S: 0,
            delta_rho: delta_rho,
            X: 0,
            nu: 0
        };
    }
    
    let X = config.solidConcVal ?? 1.0;
    if (config.solidConcMode === 'wt-total') {
        const w = config.solidConcVal ?? 1.0;
        if (w >= 100) {
            return {
                error: "全体重量濃度は100wt%未満で入力してください",
                Njs_rpm: 0,
                Njs_rps: 0,
                S: 0,
                delta_rho: delta_rho,
                X: 0,
                nu: 0
            };
        }
        X = (w / (100 - w)) * 100;
    }
    
    let S = 5.0;
    if (config.sFactorMode === 'auto') {
        S = getZwieteringPresetS();
    } else {
        S = config.sFactorCustom ?? 5.0;
    }
    
    const d = config.d;
    const g = config.g;
    
    // Newton / non-Newtonian solver
    let Njs_rps = 1.0; // initial guess
    const isNewt = (rheologyData.activeModel === 'newtonian' || !rheologyData.activeModel);
    
    if (isNewt) {
        const nu = config.mu / rhoL;
        Njs_rps = S * Math.pow(nu, 0.1) * Math.pow(dp, 0.2) * Math.pow(g * delta_rho / rhoL, 0.45) * Math.pow(X, 0.13) * Math.pow(d, -0.85);
        return {
            Njs_rps,
            Njs_rpm: Njs_rps * 60,
            S,
            delta_rho,
            X,
            nu,
            mu: config.mu
        };
    } else {
        // Implicit solver (fixed point iteration)
        const maxIter = 100;
        const tolerance = 1e-5;
        let nu = 0;
        let mu_eff = 0;
        
        for (let iter = 0; iter < maxIter; iter++) {
            mu_eff = calcEffectiveViscosity(Njs_rps);
            nu = mu_eff / rhoL;
            const next_Njs_rps = S * Math.pow(nu, 0.1) * Math.pow(dp, 0.2) * Math.pow(g * delta_rho / rhoL, 0.45) * Math.pow(X, 0.13) * Math.pow(d, -0.85);
            
            if (Math.abs(next_Njs_rps - Njs_rps) < tolerance) {
                Njs_rps = next_Njs_rps;
                break;
            }
            Njs_rps = 0.7 * next_Njs_rps + 0.3 * Njs_rps;
        }
        
        return {
            Njs_rps,
            Njs_rpm: Njs_rps * 60,
            S,
            delta_rho,
            X,
            nu,
            mu: mu_eff
        };
    }
}

function updateSimulatorResults() {
    const res = calculateNjs();
    const warnBox = document.getElementById('sim-warning-box');
    const warnText = document.getElementById('sim-warning-text');
    
    if (!warnBox) return; // not initialized
    
    if (res.error) {
        warnBox.style.display = 'block';
        warnText.textContent = res.error;
        
        document.getElementById('sim-res-S').textContent = '--';
        document.getElementById('sim-res-deltarho').textContent = '-- kg/m³';
        document.getElementById('sim-res-nu').textContent = '-- m²/s';
        document.getElementById('sim-res-X').textContent = '-- wt%';
        document.getElementById('sim-res-njs-rps').textContent = '-- 1/s';
        document.getElementById('sim-res-Njs-rpm').textContent = '-- rpm';
        document.getElementById('sim-res-P-njs').textContent = '-- W';
        document.getElementById('sim-res-Pv-njs').textContent = '-- W/m³';
        
        updateSimStatusBadge(0, 100);
        return;
    }
    
    warnBox.style.display = 'none';
    
    document.getElementById('sim-res-S').textContent = res.S.toFixed(2);
    document.getElementById('sim-res-deltarho').textContent = Math.round(res.delta_rho) + ' kg/m³';
    document.getElementById('sim-res-nu').textContent = res.nu.toExponential(4) + ' m²/s';
    document.getElementById('sim-res-X').textContent = res.X.toFixed(3) + ' wt%';
    document.getElementById('sim-res-njs-rps').textContent = res.Njs_rps.toFixed(3) + ' 1/s';
    document.getElementById('sim-res-Njs-rpm').textContent = Math.round(res.Njs_rpm) + ' rpm';
    
    // Calculate required power at Njs
    const Re_Njs = (config.rho * res.Njs_rps * Math.pow(config.d, 2)) / res.mu;
    const { Np } = calculateNpCurve(Re_Njs);
    const P_njs = Np * config.rho * Math.pow(res.Njs_rps, 3) * Math.pow(config.d, 5);
    const V = calcLiquidVolumeForPv();
    const Pv_njs = P_njs / V;
    
    document.getElementById('sim-res-P-njs').textContent = P_njs.toFixed(3) + ' W';
    document.getElementById('sim-res-Pv-njs').textContent = Pv_njs.toFixed(1) + ' W/m³';
    
    updateSimStatusBadge(config.simSpeed, res.Njs_rpm);
    updateCavernDiameter();
}

function updateSimulatorResultsOnly() {
    const res = calculateNjs();
    if (!res.error) {
        updateSimStatusBadge(config.simSpeed, res.Njs_rpm);
    }
    updateCavernDiameter();
}

// 降伏応力流体用キャバーン径（流動領域）の推算 (Elson et al.)
function updateCavernDiameter() {
    const cavernRow = document.getElementById('cavern-row');
    const dcLabel = document.getElementById('sim-res-cavern-dc');
    if (!cavernRow || !dcLabel) return;
    
    const mod = rheologyData?.activeModel;
    const isYieldFluid = mod === 'bingham' || mod === 'casson' || mod === 'hb';
    
    const models = rheologyData?.samples?.[rheologyData?.activeSample] || [];
    const modelInfo = models.find(m => m.modelId === mod);
    const pr = modelInfo?.params;
    
    if (!isYieldFluid || !pr || !pr.tau_y || pr.tau_y <= 0) {
        cavernRow.style.display = 'none';
        config.cavern_Dc = null;
        return;
    }
    
    const n_rps = config.simSpeed / 60;
    if (n_rps <= 0) {
        dcLabel.textContent = '0.000 m';
        config.cavern_Dc = 0;
        cavernRow.style.display = 'table-row';
        return;
    }
    
    // 現在の回転数での動力 P を計算
    const mu_eff = calcEffectiveViscosity(n_rps);
    const Re = (config.rho * n_rps * Math.pow(config.d, 2)) / mu_eff;
    const { Np } = calculateNpCurve(Re);
    const P = Np * config.rho * Math.pow(n_rps, 3) * Math.pow(config.d, 5);
    
    // キャバーンモデルに応じた係数 K_c
    const Kc = (config.cavernModel === 'cylindrical') ? 1.0 : 1.36;
    
    // Dc = (Kc * P / (pi^2 * tau_y * N))^(1/3)
    let Dc = Math.pow((Kc * P) / (Math.pow(Math.PI, 2) * pr.tau_y * n_rps), 1/3);
    
    // キャバーン径は槽径 DT を超えない（壁に到達）
    if (Dc > config.DT) {
        Dc = config.DT;
    }
    
    dcLabel.textContent = Dc.toFixed(3) + ' m';
    config.cavern_Dc = Dc;
    cavernRow.style.display = 'table-row';
}

function updateSimStatusBadge(currentN, njsN) {
    const badge = document.getElementById('sim-status-badge');
    if (!badge) return;
    
    if (currentN === 0) {
        badge.textContent = '完全沈降';
        badge.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        badge.style.color = '#ef4444';
        badge.style.borderColor = 'rgba(239, 68, 68, 0.2)';
    } else if (currentN < 0.9 * njsN) {
        badge.textContent = '不完全浮遊';
        badge.style.backgroundColor = 'rgba(245, 158, 11, 0.1)';
        badge.style.color = '#f59e0b';
        badge.style.borderColor = 'rgba(245, 158, 11, 0.2)';
    } else if (currentN < 1.2 * njsN) {
        badge.textContent = '完全浮遊';
        badge.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        badge.style.color = '#10b981';
        badge.style.borderColor = 'rgba(16, 185, 129, 0.2)';
    } else {
        badge.textContent = '均一分散';
        badge.style.backgroundColor = 'rgba(6, 182, 212, 0.1)';
        badge.style.color = '#06b6d4';
        badge.style.borderColor = 'rgba(6, 182, 212, 0.2)';
    }
}

function syncSimulatorSpeedWithBlock() {
    if (expBlocks.length > 0) {
        const firstBlock = expBlocks[0];
        let sumN = 0;
        firstBlock.rows.forEach(r => sumN += r.N);
        const aveN = sumN / firstBlock.rows.length;
        config.simSpeed = Math.round(aveN);
        
        const slider = document.getElementById('sim-speed-slider');
        if (slider) {
            slider.value = config.simSpeed;
            document.getElementById('sim-speed-val').textContent = config.simSpeed;
        }
    }
}

// -----------------------------------------------------------
// Canvas 2D Particle Animation Engine
// -----------------------------------------------------------

let simCanvas = null;
let simCtx = null;
let simParticles = [];
let simAnimId = null;
let simImpellerAngle = 0;    // accumulated rotation angle [rad]
let simLastFrameTime = null; // performance.now() at last frame

function getVesselVisualCoords() {
    const cx = 225;
    const D_px = 240; // width of visual tank diameter
    const scale = D_px / config.DT;
    
    let hb = 0;
    if (config.headType === 'semi-elliptical') {
        hb = D_px / 4;
    } else if (config.headType === 'dish') {
        hb = D_px * 0.1935;
    } else if (config.headType === 'hemispherical') {
        hb = D_px / 2;
    }
    
    const y_deepest = 300;
    const y_cyl = y_deepest - hb;
    const h_liquid_px = config.H * scale;
    
    // Cap Y liquid height so it doesn't overflow top flange (Y=40)
    let y_liquid = y_deepest - h_liquid_px;
    if (y_liquid < 45) {
        y_liquid = 45;
    }
    
    const lx = cx - D_px / 2;
    const rx = cx + D_px / 2;
    
    return { cx, D_px, scale, hb, y_deepest, y_cyl, y_liquid, lx, rx };
}

function getVesselBottomY(x, coords) {
    const { cx, D_px, hb, y_cyl, lx, rx } = coords;
    if (x <= lx) return y_cyl;
    if (x >= rx) return y_cyl;
    
    if (config.headType === 'flat') {
        return y_cyl;
    } else if (config.headType === 'hemispherical') {
        const R = D_px / 2;
        const dx = x - cx;
        return y_cyl + Math.sqrt(Math.max(0, R * R - dx * dx));
    } else {
        const a = D_px / 2;
        const b = hb;
        const dx = x - cx;
        return y_cyl + b * Math.sqrt(Math.max(0, 1 - (dx * dx) / (a * a)));
    }
}

function getFluidVelocity(x, y, speed_rpm, coords, p = {}) {
    const { cx, D_px, scale, y_deepest, y_liquid, lx, rx } = coords;
    
    if (speed_rpm <= 5 || y < y_liquid || y > getVesselBottomY(x, coords)) {
        return { vx: 0, vy: 0 };
    }
    
    const speedMagnitude = 3.5 * (speed_rpm / 600);
    const clearance_px = config.clearance * scale;
    const b_px = config.b * scale;

    // --- Compute multi-stage Y positions (same logic as drawParticleSimulation) ---
    const n_stages = parseInt(config.n_stage) || 1;
    const y_bottom_impeller = y_deepest - clearance_px - b_px / 2;
    let stages_y = [];
    if (n_stages === 1) {
        stages_y.push(y_bottom_impeller);
    } else {
        const y_top_impeller_limit = y_liquid + b_px / 2;
        const available_span = y_bottom_impeller - y_top_impeller_limit;
        const ideal_gap = available_span / (n_stages - 1);
        const stage_gap = Math.max(b_px * 1.3, ideal_gap);
        for (let i = 0; i < n_stages; i++) {
            stages_y.push(y_bottom_impeller - (i * stage_gap));
        }
    }

    // --- Cavern / dead-zone decay (multi-stage: each stage has its own cavern) ---
    // For yield-stress fluids, dead zone is tested around the nearest stage
    let cavernDecay = 1.0;
    if (config.cavern_Dc > 0) {
        const cavernRadius = (config.cavern_Dc / 2) * scale;
        // Find closest stage to this point
        let minDistOut = Infinity;
        for (const y_imp_s of stages_y) {
            let distOut = 0;
            if (config.cavernModel === 'cylindrical') {
                const hc = cavernRadius * 1.5;
                distOut = Math.max(0, Math.max(Math.abs(x - cx) - cavernRadius, Math.abs(y - y_imp_s) - hc / 2));
            } else {
                const dist3d = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - y_imp_s, 2));
                distOut = Math.max(0, dist3d - cavernRadius);
            }
            if (distOut < minDistOut) minDistOut = distOut;
        }
        if (minDistOut > 0) {
            cavernDecay = Math.max(0, 1.0 - (minDistOut / 20.0));
            if (cavernDecay === 0) return { vx: 0, vy: 0 };
        }
    }

    const rxScale = p.relVortexX || 1.0;
    const ryScale = p.relVortexY || 1.0;
    const isRadial = (config.impellerType === 'flat-paddle' || config.impellerType === 'flat-turbine');
    const inLeft = x < cx;

    // --- Accumulate velocity contributions from all stages ---
    // For each stage, define the circulation zones above/below that stage
    // (bounded between adjacent stages or liquid surface / vessel bottom)
    let totalVx = 0;
    let totalVy = 0;
    let totalWeight = 0;

    for (let si = 0; si < stages_y.length; si++) {
        const y_imp = stages_y[si];

        // Zone boundaries for this stage
        // Upper boundary: midpoint to stage above (or liquid surface)
        const y_upper_bound = si < stages_y.length - 1
            ? (stages_y[si] + stages_y[si + 1]) / 2  // midpoint between this and upper stage
            : y_liquid;
        // Lower boundary: midpoint to stage below (or vessel bottom)
        const y_lower_bound = si > 0
            ? (stages_y[si] + stages_y[si - 1]) / 2  // midpoint between this and lower stage
            : y_deepest;

        // How much this stage influences the current point:
        // Use a soft distance weight — stronger when inside this stage's zone
        const zone_h = (y_lower_bound - y_upper_bound) || 1;
        const dist_to_stage_y = Math.abs(y - y_imp);
        // Gaussian weight based on distance to impeller in y, clamped at half zone height
        const sigma = zone_h / 2;
        const weight = Math.exp(-(dist_to_stage_y * dist_to_stage_y) / (2 * sigma * sigma));

        if (weight < 0.001) continue;

        const inUpper = y < y_imp;

        let vx_dir = 0, vy_dir = 0;

        if (isRadial) {
            // Radial (flat-turbine / flat-paddle): double-loop per stage
            const h_upper = y_imp - y_upper_bound;
            const h_lower = y_lower_bound - y_imp;
            const vortexOffset = (D_px / 4) * rxScale;
            const vx_c = inLeft ? (lx + vortexOffset) : (rx - vortexOffset);
            const vy_c = inUpper
                ? (y_upper_bound + (h_upper / 2) * ryScale)
                : (y_imp + (h_lower / 2) * ryScale);
            const rx_v = x - vx_c;
            const ry_v = y - vy_c;
            const dist = Math.sqrt(rx_v * rx_v + ry_v * ry_v) || 1;

            if (inUpper) {
                vx_dir = inLeft ? (-ry_v / dist) : (ry_v / dist);
                vy_dir = inLeft ? (rx_v / dist) : (-rx_v / dist);
            } else {
                vx_dir = inLeft ? (ry_v / dist) : (-ry_v / dist);
                vy_dir = inLeft ? (-rx_v / dist) : (rx_v / dist);
            }

            const wallDist = Math.min(x - lx, rx - x, y - y_liquid, getVesselBottomY(x, coords) - y);
            const wallFactor = Math.min(1.0, wallDist / 10);
            const centerFactor = Math.min(1.0, dist / 8);

            totalVx += vx_dir * speedMagnitude * wallFactor * centerFactor * weight;
            totalVy += vy_dir * speedMagnitude * wallFactor * centerFactor * weight;

        } else {
            // Axial flow (propeller, pitched-paddle, faudler): single loop per stage zone
            const h_zone = y_lower_bound - y_upper_bound;
            const vy_c = y_upper_bound + (h_zone / 2) * ryScale;
            const vortexOffset = (D_px / 4) * rxScale;
            const vx_c = inLeft ? (lx + vortexOffset) : (rx - vortexOffset);
            const rx_v = x - vx_c;
            const ry_v = y - vy_c;
            const dist = Math.sqrt(rx_v * rx_v + ry_v * ry_v) || 1;

            vx_dir = inLeft ? (-ry_v / dist) : (ry_v / dist);
            vy_dir = inLeft ? (rx_v / dist) : (-rx_v / dist);

            const wallDist = Math.min(x - lx, rx - x, y - y_liquid, getVesselBottomY(x, coords) - y);
            const wallFactor = Math.min(1.0, wallDist / 10);
            const centerFactor = Math.min(1.0, dist / 12);

            totalVx += vx_dir * speedMagnitude * wallFactor * centerFactor * weight;
            totalVy += vy_dir * speedMagnitude * wallFactor * centerFactor * weight;
        }

        totalWeight += weight;
    }

    if (totalWeight < 0.001) return { vx: 0, vy: 0 };

    // Normalize by total weight so total speed ≈ speedMagnitude
    const normFactor = Math.min(1.5, totalWeight) / totalWeight;

    return {
        vx: totalVx * normFactor * cavernDecay,
        vy: totalVy * normFactor * cavernDecay
    };
}


function switchMainTab(tab) {
    config.activeTab = tab;
    saveCurrentState();

    const btnRushton = document.getElementById('tab-btn-rushton');
    const btnPartsim = document.getElementById('tab-btn-partsim');
    const contentRushton = document.getElementById('tab-content-rushton');
    const contentPartsim = document.getElementById('tab-content-partsim');
    const controlsRushton = document.getElementById('rushton-controls');
    const controlsPartsim = document.getElementById('partsim-controls');

    if (!btnRushton || !btnPartsim || !contentRushton || !contentPartsim) return;

    if (tab === 'rushton') {
        btnRushton.classList.add('active');
        btnRushton.style.color = 'var(--accent-color)';
        btnRushton.style.borderBottom = '2px solid var(--accent-color)';
        btnRushton.style.fontWeight = '600';

        btnPartsim.classList.remove('active');
        btnPartsim.style.color = 'var(--text-secondary)';
        btnPartsim.style.borderBottom = '2px solid transparent';
        btnPartsim.style.fontWeight = '500';

        contentRushton.style.display = 'block';
        contentPartsim.style.display = 'none';

        if (controlsRushton) controlsRushton.style.display = 'flex';
        if (controlsPartsim) controlsPartsim.style.display = 'none';

        // Pause particle animation to save CPU
        if (simAnimId) {
            cancelAnimationFrame(simAnimId);
            simAnimId = null;
        }
        
        // Resize and redraw Chart.js chart since parent visibility toggled
        if (chart) {
            chart.resize();
            chart.update();
        }
    } else {
        btnPartsim.classList.add('active');
        btnPartsim.style.color = 'var(--accent-color)';
        btnPartsim.style.borderBottom = '2px solid var(--accent-color)';
        btnPartsim.style.fontWeight = '600';

        btnRushton.classList.remove('active');
        btnRushton.style.color = 'var(--text-secondary)';
        btnRushton.style.borderBottom = '2px solid transparent';
        btnRushton.style.fontWeight = '500';

        contentRushton.style.display = 'none';
        contentPartsim.style.display = 'flex';

        if (controlsRushton) controlsRushton.style.display = 'none';
        if (controlsPartsim) controlsPartsim.style.display = 'block';

        // Initialize and start particle simulation loop
        initParticleSimulation();
    }
}

function initParticleSimulation() {
    simCanvas = document.getElementById('particleSimCanvas');
    if (!simCanvas) return;
    simCtx = simCanvas.getContext('2d');
    
    if (simAnimId) {
        cancelAnimationFrame(simAnimId);
        simAnimId = null;
    }
    simImpellerAngle = 0;
    simLastFrameTime = null;
    
    const coords = getVesselVisualCoords();
    const { lx, D_px } = coords;
    
    // Initialize target particles at the bottom of the vessel based on concentration
    const targetCount = Math.min(1200, Math.max(100, Math.round(200 + 400 * Math.log10(1 + 9 * (config.solidConcVal || 1.0)))));
    simParticles = [];
    for (let i = 0; i < targetCount; i++) {
        const px = lx + Math.random() * D_px;
        const py = getVesselBottomY(px, coords) - 2 - Math.random() * 8;
        simParticles.push({
            x: px,
            y: py,
            vx: 0,
            vy: 0,
            relSize: 0.6 + Math.random() * 0.8,
            relVortexX: 0.75 + Math.random() * 0.5,
            relVortexY: 0.75 + Math.random() * 0.5,
            radius: 1.5,
            color: '#78350f'
        });
    }
    
    function loop() {
        drawParticleSimulation();
        simAnimId = requestAnimationFrame(loop);
    }
    loop();
}

function getBladePointsAndDepth(phi, r_in, r_out, b_px, impellerType, cx, y_imp) {
    const N = 8;
    const points = [];
    
    // Determine pitch angle (tilt around radial axis)
    let pitchAngle = 0;
    if (impellerType === 'pitched-paddle') {
        pitchAngle = Math.PI / 4; // 45 degrees
    } else if (impellerType === 'propeller') {
        pitchAngle = Math.PI / 6; // 30 degrees
    }
    
    // 1. Calculate top edge points (from r_in to r_out)
    for (let i = 0; i <= N; i++) {
        const t = i / N;
        const r = r_in + t * (r_out - r_in);
        
        let w = b_px;
        if (impellerType === 'propeller') {
            w = b_px * Math.sin(Math.PI * t);
        } else if (impellerType === 'faudler') {
            // Faudler blades are slightly tapered
            w = b_px * (1.0 - 0.4 * t);
        }
        
        let localPhi = phi;
        if (impellerType === 'faudler') {
            localPhi = phi - 0.45 * t; // Curve backward
        }
        
        const chi = -w / 2;
        
        // 3D coordinates relative to (cx, y_imp, 0)
        const x3d = r * Math.cos(localPhi) - chi * Math.sin(pitchAngle) * Math.sin(localPhi);
        const y3d = chi * Math.cos(pitchAngle);
        const z3d = r * Math.sin(localPhi) + chi * Math.sin(pitchAngle) * Math.cos(localPhi);
        
        points.push({ x: cx + x3d, y: y_imp + y3d, z: z3d });
    }
    
    // 2. Calculate bottom edge points (from r_out back to r_in)
    for (let i = N; i >= 0; i--) {
        const t = i / N;
        const r = r_in + t * (r_out - r_in);
        
        let w = b_px;
        if (impellerType === 'propeller') {
            w = b_px * Math.sin(Math.PI * t);
        } else if (impellerType === 'faudler') {
            w = b_px * (1.0 - 0.4 * t);
        }
        
        let localPhi = phi;
        if (impellerType === 'faudler') {
            localPhi = phi - 0.45 * t;
        }
        
        const chi = w / 2;
        
        const x3d = r * Math.cos(localPhi) - chi * Math.sin(pitchAngle) * Math.sin(localPhi);
        const y3d = chi * Math.cos(pitchAngle);
        const z3d = r * Math.sin(localPhi) + chi * Math.sin(pitchAngle) * Math.cos(localPhi);
        
        points.push({ x: cx + x3d, y: y_imp + y3d, z: z3d });
    }
    
    // Average Z depth for sorting
    let sumZ = 0;
    points.forEach(pt => sumZ += pt.z);
    const avgZ = sumZ / points.length;
    
    return { points, avgZ };
}

function drawParticleSimulation() {
    if (!simCanvas || !simCtx) return;
    
    const coords = getVesselVisualCoords();
    const { cx, D_px, scale, hb, y_deepest, y_cyl, y_liquid, lx, rx } = coords;
    
    simCtx.clearRect(0, 0, simCanvas.width, simCanvas.height);
    
    // 1. Draw Liquid Region Fill
    simCtx.save();
    simCtx.fillStyle = 'rgba(6, 182, 212, 0.05)';
    simCtx.beginPath();
    simCtx.moveTo(lx, y_liquid);
    simCtx.lineTo(lx, y_cyl);
    
    if (config.headType === 'semi-elliptical' || config.headType === 'dish') {
        simCtx.ellipse(cx, y_cyl, D_px / 2, hb, 0, Math.PI, 0, true);
    } else if (config.headType === 'hemispherical') {
        simCtx.arc(cx, y_cyl, D_px / 2, Math.PI, 0, true);
    } else {
        simCtx.lineTo(rx, y_cyl);
    }
    simCtx.lineTo(rx, y_liquid);
    simCtx.closePath();
    simCtx.fill();
    
    // Draw Liquid Surface
    simCtx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
    simCtx.lineWidth = 1.5;
    simCtx.beginPath();
    simCtx.moveTo(lx, y_liquid);
    simCtx.lineTo(rx, y_liquid);
    simCtx.stroke();
    simCtx.restore();
    
    // 2. Draw Baffles
    if (config.baffleActive) {
        simCtx.save();
        simCtx.fillStyle = 'rgba(16, 185, 129, 0.08)';
        simCtx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
        simCtx.lineWidth = 1;
        const bw_px = Math.max(4, config.Bw * scale);
        const baffle_h = y_cyl - y_liquid;
        
        simCtx.fillRect(lx, y_liquid, bw_px, baffle_h);
        simCtx.strokeRect(lx, y_liquid, bw_px, baffle_h);
        
        if (config.nB > 1) {
            simCtx.fillRect(rx - bw_px, y_liquid, bw_px, baffle_h);
            simCtx.strokeRect(rx - bw_px, y_liquid, bw_px, baffle_h);
        }
        simCtx.restore();
    }
    
    // 2.5 Draw Dead Water Zone and Cavern (for Yield Stress Fluids)
    if (config.cavern_Dc > 0) {
        simCtx.save();
        const cavernRadius = (config.cavern_Dc / 2) * scale;
        const clearance_px = config.clearance * scale;
        const b_px = config.b * scale;
        const y_imp = y_deepest - clearance_px - b_px / 2;
        
        // タンク全体を暗くして死水域を表現
        simCtx.fillStyle = 'rgba(15, 23, 42, 0.5)';
        simCtx.beginPath();
        simCtx.moveTo(lx, y_liquid);
        simCtx.lineTo(lx, y_cyl);
        if (config.headType === 'semi-elliptical' || config.headType === 'dish') {
            simCtx.ellipse(cx, y_cyl, D_px / 2, hb, 0, Math.PI, 0, true);
        } else if (config.headType === 'hemispherical') {
            simCtx.arc(cx, y_cyl, D_px / 2, Math.PI, 0, true);
        } else {
            simCtx.lineTo(rx, y_cyl);
        }
        simCtx.lineTo(rx, y_liquid);
        simCtx.closePath();
        simCtx.fill();
        
        // キャバーン領域を「くり抜く」 (流動領域) - 境界をさらに曖昧化
        simCtx.globalCompositeOperation = 'destination-out';
        simCtx.fillStyle = 'rgba(255, 255, 255, 1)';
        simCtx.filter = 'blur(24px)';
        simCtx.beginPath();
        if (config.cavernModel === 'cylindrical') {
            const h = cavernRadius * 1.5; // 円筒モデルの高さ（概算）
            simCtx.fillRect(cx - cavernRadius, y_imp - h/2, cavernRadius * 2, h);
        } else {
            simCtx.arc(cx, y_imp, cavernRadius, 0, 2 * Math.PI);
            simCtx.fill();
        }
        simCtx.filter = 'none';
        
        // 通常の描画モードに戻す
        simCtx.globalCompositeOperation = 'source-over';
        
        // ラベル描画
        simCtx.fillStyle = 'rgba(245, 158, 11, 0.9)';
        simCtx.font = '10px sans-serif';
        simCtx.fillText('流動領域', cx + cavernRadius + 10, y_imp - 5);
        
        simCtx.fillStyle = 'rgba(148, 163, 184, 0.9)';
        simCtx.fillText('死水域 (Dead Zone)', lx + 10, y_liquid + 20);
        simCtx.restore();
    }
    
    // Adjust particle count dynamically based on concentration
    const targetCount = Math.min(1200, Math.max(100, Math.round(200 + 400 * Math.log10(1 + 9 * (config.solidConcVal || 1.0)))));
    if (simParticles.length < targetCount) {
        const toAdd = targetCount - simParticles.length;
        for (let i = 0; i < toAdd; i++) {
            const px = lx + Math.random() * D_px;
            const py = getVesselBottomY(px, coords) - 2 - Math.random() * 8;
            simParticles.push({
                x: px,
                y: py,
                vx: 0,
                vy: 0,
                relSize: 0.6 + Math.random() * 0.8,
                relVortexX: 0.75 + Math.random() * 0.5,
                relVortexY: 0.75 + Math.random() * 0.5,
                radius: 1.5,
                color: '#78350f'
            });
        }
    } else if (simParticles.length > targetCount) {
        simParticles.length = targetCount;
    }

    // 3. Draw Particles (under physics)
    const njsResult = calculateNjs();
    const njs_rpm = njsResult.error ? 1000 : njsResult.Njs_rpm;
    const liftOffThreshold = 0.15 * njs_rpm;
    
    // Base radius scales with config.dp_um
    const baseRadius = Math.max(0.8, Math.min(6.0, 0.5 + 0.1 * Math.sqrt(config.dp_um || 150)));

    simCtx.save();
    simParticles.forEach(p => {
        if (!p.relSize) {
            p.relSize = 0.6 + Math.random() * 0.8;
        }
        p.radius = baseRadius * p.relSize;

        const fluidVel = getFluidVelocity(p.x, p.y, config.simSpeed, coords, p);
        
        // Fluid drag coupling - responsiveness (inertia) decreases with particle density and size
        const dp = config.dp_um || 150;
        const inertia = Math.max(0.015, 0.3 / (1.0 + 0.6 * (config.rho_S / 1000) * Math.sqrt(dp / 150)));
        p.vx += (fluidVel.vx - p.vx) * inertia;
        p.vy += (fluidVel.vy - p.vy) * inertia;
        
        // Sedimentation gravity force
        const delta_rho = Math.max(0, config.rho_S - config.rho);
        const settling = 0.04 * (delta_rho / 1500) * Math.pow(dp / 150, 1.5);
        p.vy += settling;
        
        // Turbulent fluctuations (scales with rpm)
        const turb = 0.35 * (config.simSpeed / 300) * (p.relSize || 1.0);
        p.vx += (Math.random() - 0.5) * turb;
        p.vy += (Math.random() - 0.5) * turb;
        
        // Update coordinates
        p.x += p.vx;
        p.y += p.vy;
        
        // Boundary collision
        if (p.x < lx + p.radius) { p.x = lx + p.radius; p.vx = -p.vx * 0.2; }
        if (p.x > rx - p.radius) { p.x = rx - p.radius; p.vx = -p.vx * 0.2; }
        
        if (p.y < y_liquid + p.radius) { p.y = y_liquid + p.radius; p.vy = Math.abs(p.vy) * 0.1; }
        
        const y_bot = getVesselBottomY(p.x, coords);
        
        if (p.y > y_bot - p.radius - 1) {
            p.y = y_bot - p.radius - 1;
            
            if (config.simSpeed < liftOffThreshold) {
                // Completely settled
                p.vx = 0;
                p.vy = 0;
                p.color = '#78350f'; // resting: dark amber
            } else {
                // Rolling/bouncing at bottom
                p.vy = -Math.abs(p.vy) * 0.05;
                const sweepDir = (config.impellerType === 'pitched-paddle' || config.impellerType === 'propeller')
                    ? (p.x < cx ? -0.8 : 0.8) // sweep outwards
                    : (p.x < cx ? 0.8 : -0.8); // sweep inwards
                p.vx += sweepDir * 0.12 * (config.simSpeed / 300);
                p.color = '#b45309'; // rolling: medium gold
            }
        } else {
            // Suspended
            if (config.simSpeed >= njs_rpm) {
                p.color = '#f59e0b'; // fully suspended: bright orange
            } else {
                p.color = '#d97706'; // partially suspended: medium orange
            }
        }
        
        // Draw particle
        simCtx.fillStyle = p.color;
        simCtx.beginPath();
        simCtx.arc(p.x, p.y, p.radius, 0, 2 * Math.PI);
        simCtx.fill();
    });
    simCtx.restore();
    
    // 4 & 5. Draw Shaft + Impeller Blades (3D rotating, depth-sorted)
    const clearance_px = config.clearance * scale;
    const b_px = config.b * scale;
    const y_bottom_impeller = y_deepest - clearance_px - b_px / 2;
    const d_px = config.d * scale;
    const r_hub = 5;
    const r_in = r_hub;
    const r_out = d_px / 2;
    
    // Calculate current rotation angle using delta-time accumulation
    // (avoids float precision loss from large Date.now() values)
    const nowPerfMs = performance.now();
    if (simLastFrameTime !== null) {
        const dtSec = (nowPerfMs - simLastFrameTime) / 1000;
        const omega = (config.simSpeed > 5) ? (config.simSpeed * Math.PI / 30) : 0;
        simImpellerAngle += omega * dtSec;
        // Keep angle in [0, 2π) to avoid unbounded growth
        simImpellerAngle = simImpellerAngle % (2 * Math.PI);
    }
    simLastFrameTime = nowPerfMs;
    const angle = simImpellerAngle;
    
    // Determine blade count per impeller type
    const bladeCountMap = {
        'flat-turbine':   6,
        'pitched-paddle': 4,
        'flat-paddle':    2,
        'propeller':      3,
        'faudler':        3,
    };
    const nBlades = bladeCountMap[config.impellerType] || 2;
    
    // Multi-stage Y positions
    const n_stages = parseInt(config.n_stage) || 1;
    let stages_y = [];
    if (n_stages === 1) {
        stages_y.push(y_bottom_impeller);
    } else {
        const y_top_impeller_limit = y_liquid + b_px / 2;
        const available_span = y_bottom_impeller - y_top_impeller_limit;
        const ideal_gap = available_span / (n_stages - 1);
        const stage_gap = Math.max(b_px * 1.3, ideal_gap);
        for (let i = 0; i < n_stages; i++) {
            stages_y.push(y_bottom_impeller - (i * stage_gap));
        }
    }
    
    // Build draw-element list for depth sorting
    const drawElements = [];
    
    // Shaft (drawn at Z = -0.1, i.e., behind everything except blades behind it)
    drawElements.push({
        avgZ: -0.1,
        draw: () => {
            simCtx.save();
            simCtx.strokeStyle = '#52525b';
            simCtx.lineWidth = 4;
            simCtx.lineCap = 'round';
            simCtx.beginPath();
            simCtx.moveTo(cx, y_liquid - 15);
            simCtx.lineTo(cx, y_bottom_impeller + b_px / 2);
            simCtx.stroke();
            simCtx.restore();
        }
    });
    
    stages_y.forEach(y_imp => {
        // --- Turbine disc (Rushton only) — drawn slightly in front of back blades ---
        if (config.impellerType === 'flat-turbine') {
            drawElements.push({
                avgZ: 0.01,
                draw: () => {
                    simCtx.save();
                    simCtx.fillStyle = '#a1a1aa';
                    simCtx.strokeStyle = '#52525b';
                    simCtx.lineWidth = 0.8;
                    simCtx.fillRect(cx - r_out * 0.7, y_imp - 1.5, r_out * 1.4, 3);
                    simCtx.strokeRect(cx - r_out * 0.7, y_imp - 1.5, r_out * 1.4, 3);
                    simCtx.restore();
                }
            });
        }
        
        // --- Hub at Z = 0 (slightly in front of disc) ---
        drawElements.push({
            avgZ: 0.02,
            draw: () => {
                simCtx.save();
                simCtx.fillStyle = '#3f3f46';
                simCtx.strokeStyle = '#27272a';
                simCtx.lineWidth = 1;
                simCtx.beginPath();
                simCtx.arc(cx, y_imp, r_hub, 0, Math.PI * 2);
                simCtx.fill();
                simCtx.stroke();
                simCtx.restore();
            }
        });
        
        // --- Blades ---
        for (let k = 0; k < nBlades; k++) {
            const phi = angle + (k * 2 * Math.PI / nBlades);
            const { points, avgZ } = getBladePointsAndDepth(
                phi, r_in, r_out, b_px, config.impellerType, cx, y_imp
            );
            
            // Depth-dependent shading: front blades are brighter
            const brightness = 0.65 + 0.35 * ((avgZ / r_out) * 0.5 + 0.5);
            const baseH = 330; // pink hue
            const fillColor = `hsl(${baseH}, 75%, ${Math.round(50 * brightness)}%)`;
            const strokeColor = `hsl(${baseH}, 80%, ${Math.round(38 * brightness)}%)`;
            
            drawElements.push({
                avgZ,
                draw: () => {
                    simCtx.save();
                    simCtx.fillStyle = fillColor;
                    simCtx.strokeStyle = strokeColor;
                    simCtx.lineWidth = 1.2;
                    simCtx.beginPath();
                    simCtx.moveTo(points[0].x, points[0].y);
                    for (let i = 1; i < points.length; i++) {
                        simCtx.lineTo(points[i].x, points[i].y);
                    }
                    simCtx.closePath();
                    simCtx.fill();
                    simCtx.stroke();
                    simCtx.restore();
                }
            });
        }
    });
    
    // Sort elements back-to-front (ascending Z)
    drawElements.sort((a, b) => a.avgZ - b.avgZ);
    drawElements.forEach(el => el.draw());
    

    // 6. Draw Vessel Outer Wall Outline
    simCtx.save();
    simCtx.strokeStyle = '#d4d4d8';
    simCtx.lineWidth = 2;
    simCtx.lineCap = 'round';
    simCtx.lineJoin = 'round';
    simCtx.beginPath();
    simCtx.moveTo(lx, y_liquid - 10);
    simCtx.lineTo(lx, y_cyl);
    
    if (config.headType === 'semi-elliptical' || config.headType === 'dish') {
        simCtx.ellipse(cx, y_cyl, D_px / 2, hb, 0, Math.PI, 0, true);
    } else if (config.headType === 'hemispherical') {
        simCtx.arc(cx, y_cyl, D_px / 2, Math.PI, 0, true);
    } else {
        simCtx.lineTo(rx, y_cyl);
    }
    simCtx.lineTo(rx, y_liquid - 10);
    simCtx.stroke();
    simCtx.restore();
}

