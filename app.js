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
    n_stage: 4,
    baffleActive: true,
    nB: 1,
    Bw: 0.014
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
            initInputs();
            
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
}

function initEventListeners() {
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
}

function toggleBaffleInputs() {
    const active = config.baffleActive;
    document.getElementById('nB').disabled = !active;
    document.getElementById('Bw').disabled = !active;
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
            return Math.PI * R * R * H * H * (h_dish / 2 - H / 3) / (h_dish * h_dish);
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
    const Np0 = (1.2 * Math.pow(Math.PI, 4) * Math.pow(beta, 2) / volume_factor) * f;

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
    updateChart();
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
        <td class="calculated-cell highlight-blue">${Math.round(ave_Re)}</td>
        <td class="calculated-cell highlight-blue">${ave_Np.toFixed(2)}</td>
        <td class="calculated-cell highlight-blue">${ave_Fr.toFixed(2)}</td>
        <td></td>
    `;

    // Update Header Meta
    document.getElementById(`${blockId}-meta-re`).innerHTML = `Re: <strong>${Math.round(ave_Re)}</strong>`;
    document.getElementById(`${blockId}-meta-np`).innerHTML = `Np: <strong>${ave_Np.toFixed(2)}</strong>`;
    document.getElementById(`${blockId}-meta-fr`).innerHTML = `Fr: <strong>${ave_Fr.toFixed(2)}</strong>`;
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

function recalculateExperimentalData() {
    expBlocks.forEach(b => {
        recalculateBlock(b.id);
    });
}

function calculateReVal(n) {
    return (config.rho * n * Math.pow(config.d, 2)) / config.mu;
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
        plugins: [chartAreaBorder],
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
                        const minVal = (scale.min !== undefined && scale.min !== null && !isNaN(scale.min)) ? scale.min : ((scale.dataMin !== undefined && scale.dataMin !== null) ? scale.dataMin : 0.1);
                        const maxVal = (scale.max !== undefined && scale.max !== null && !isNaN(scale.max)) ? scale.max : ((scale.dataMax !== undefined && scale.dataMax !== null) ? scale.dataMax : 100000);
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
                    min: 0.1,
                    max: 100000
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

    // 1. Generate Prediction Curves
    const unbaffledData = [];
    const baffledData = [];
    const maxData = [];
    
    // Logarithmic sampling from Re = 0.1 to 100,000
    const startLog = -1;
    const endLog = 5;
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

    // 2. Generate Experimental Dots
    const expDots = [];
    expBlocks.forEach(b => {
        if (b.aveCalculated && b.aveCalculated.Re > 0 && b.aveCalculated.Np > 0) {
            expDots.push({
                x: b.aveCalculated.Re,
                y: b.aveCalculated.Np,
                N: b.aveCalculated.N
            });
        }
    });

    // Replace Datasets
    chart.data.datasets = [
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
        },
        {
            label: '実験データ (実測値)',
            data: expDots,
            showLine: false,
            backgroundColor: '#10b981',
            borderColor: '#f3f4f6',
            borderWidth: 1.5,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointStyle: 'circle'
        }
    ];

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
    config.n_stage = 4;
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
        
        let importedConfig = {};
        let importedBlocksMap = {};

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) return;

            if (trimmed.startsWith('--- CONFIGURATION ---')) {
                inConfig = true;
                inData = false;
                return;
            }
            if (trimmed.startsWith('--- EXPERIMENTAL DATA ---')) {
                inConfig = false;
                inData = true;
                return;
            }
            if (trimmed.startsWith('---')) {
                inConfig = false;
                inData = false;
                return;
            }

            const parts = trimmed.split(',');
            if (inConfig && parts.length >= 2) {
                const key = parts[0].trim();
                let val = parts[1].trim();
                if (val === 'true') val = true;
                else if (val === 'false') val = false;
                else if (!isNaN(val)) val = parseFloat(val);
                importedConfig[key] = val;
            }

            if (inData && parts.length >= 5) {
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
        });

        // Apply config
        if (Object.keys(importedConfig).length > 0) {
            config = { ...config, ...importedConfig };
            initInputs();
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
        } else if (copy.label.includes('実験データ')) {
            copy.backgroundColor = '#059669'; // High-contrast Emerald
            copy.borderColor = '#111827'; // Solid Dark boundary for dots
        }
        return copy;
    });

    const pdfChart = new Chart(pdfCtx, {
        type: 'scatter',
        data: {
            datasets: lightDatasets
        },
        plugins: [lightChartAreaBorder, customCanvasBackgroundColor],
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
            expBlocks: expBlocks
        };
        localStorage.setItem('agitator_current_state', JSON.stringify(state));
    } catch (e) {
        console.error("Failed to save current state to localStorage", e);
    }
}
