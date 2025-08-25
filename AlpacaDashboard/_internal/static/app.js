document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('key-form')) {
        setupKeyForm();
    }
    if (document.getElementById('dashboard-container')) {
        loadInitialData();
        initBasketManager();
    }
});

// --- State Management ---
let state = {
    account: {},
    positions: [],
    baskets: {},
    selectedBasket: null,
    charts: {
        allocationChart: null,
    }
};

// --- Initial Data Loading ---
async function loadInitialData() {
    await Promise.all([fetchAccountInfo(), fetchPositions(), fetchBaskets()]);
    render();
}

// --- Setup & Data Fetching Functions ---
function setupKeyForm() {
    const keyForm = document.getElementById('key-form');
    keyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const apiKey = document.getElementById('api-key').value;
        const secretKey = document.getElementById('secret-key').value;
        const paper = document.getElementById('paper-trading').checked;
        const errorMessage = document.getElementById('error-message');
        const formData = new FormData();
        formData.append('api_key', apiKey);
        formData.append('secret_key', secretKey);
        formData.append('paper', paper);

        try {
            const response = await fetch('/api/keys', { method: 'POST', body: formData });
            if (response.ok) {
                window.location.reload();
            } else {
                const errorData = await response.json();
                errorMessage.textContent = `Error: ${errorData.error || 'Could not save keys.'}`;
                errorMessage.classList.remove('d-none');
            }
        } catch (error) {
            errorMessage.textContent = `An unexpected error occurred: ${error}`;
            errorMessage.classList.remove('d-none');
        }
    });
}

async function fetchAccountInfo() {
    try {
        const response = await fetch('/api/account');
        if (!response.ok) throw new Error((await response.json()).error || 'Failed to fetch account info.');
        state.account = await response.json();
    } catch (error) {
        console.error('Error fetching account info:', error);
        state.account = { error: error.message };
    }
}

async function fetchPositions() {
    try {
        const response = await fetch('/api/positions');
        if (!response.ok) throw new Error((await response.json()).error || 'Failed to fetch positions.');
        state.positions = await response.json();
    } catch (error) {
        console.error('Error fetching positions:', error);
        state.positions = { error: error.message };
    }
}

async function fetchBaskets() {
    try {
        const response = await fetch('/api/baskets');
        state.baskets = await response.json();
        if (!state.selectedBasket && Object.keys(state.baskets).length > 0) {
            state.selectedBasket = Object.keys(state.baskets)[0];
        }
    } catch (e) {
        console.error("Could not load baskets:", e);
    }
}

// --- Main Render Function ---
function render() {
    renderAccountInfo();
    renderPositionsTable();
    renderBasketSelector();
    renderBasketDetails();
    renderAllocationChart();
}

// --- Rendering Sub-functions ---
function renderAccountInfo() {
    const accountInfoDiv = document.getElementById('account-info');
    if (!accountInfoDiv) return;
    if (state.account.error) {
        accountInfoDiv.innerHTML = `<div class="alert alert-danger">Could not load account data: ${state.account.error}</div>`;
        return;
    }
    document.getElementById('portfolio-value').textContent = `$${(state.account.portfolio_value || 0).toFixed(2)} ${state.account.currency}`;
    document.getElementById('buying-power').textContent = `$${(state.account.buying_power || 0).toFixed(2)}`;
    document.getElementById('account-status').innerHTML = `<span class="badge bg-success">${state.account.status}</span>`;
}

function renderPositionsTable() {
    const positionsTable = document.getElementById('positions-table');
    if (!positionsTable) return;
    if (state.positions.error) {
        positionsTable.innerHTML = `<tr><td colspan="5" class="alert alert-danger">Could not load positions: ${state.positions.error}</td></tr>`;
        return;
    }
    if (state.positions.length === 0) {
        positionsTable.innerHTML = '<tr><td colspan="5" class="text-center">No open positions.</td></tr>';
        return;
    }
    let tableHtml = '';
    state.positions.forEach(pos => {
        const pl = parseFloat(pos.unrealized_pl);
        const plClass = pl >= 0 ? 'text-success' : 'text-danger';
        tableHtml += `
            <tr>
                <td>${pos.symbol}</td>
                <td>${pos.qty}</td>
                <td>$${pos.market_value.toFixed(2)}</td>
                <td>$${pos.current_price.toFixed(2)}</td>
                <td class="${plClass}">${pl.toFixed(2)}</td>
            </tr>
        `;
    });
    positionsTable.innerHTML = tableHtml;
}

function renderBasketSelector() {
    const select = document.getElementById('basket-select');
    if (!select) return;
    select.innerHTML = '';
    for (const name in state.baskets) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (name === state.selectedBasket) option.selected = true;
        select.appendChild(option);
    }
    if (Object.keys(state.baskets).length === 0) {
        select.innerHTML = '<option>No baskets created yet</option>';
    }
}

function renderBasketDetails() {
    const tableBody = document.getElementById('basket-assets-table');
    const targetTotalEl = document.getElementById('basket-target-percentage');
    const totalValueEl = document.getElementById('basket-total-value');
    const errorDiv = document.getElementById('basket-percentage-error');
    const executionBasketName = document.getElementById('execution-basket-name');
    const executeBtn = document.querySelector('#execute-basket-form button');
    if (!tableBody) return;

    if (!state.selectedBasket) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center">Please select or create a basket.</td></tr>';
        targetTotalEl.textContent = '0';
        totalValueEl.textContent = '$0.00';
        executionBasketName.textContent = 'No Basket Selected';
        executeBtn.disabled = true;
        return;
    }

    const basket = state.baskets[state.selectedBasket] || [];
    const positionsMap = new Map((state.positions && !state.positions.error) ? state.positions.map(p => [p.symbol, p]) : []);
    const totalBasketValue = basket.reduce((sum, item) => {
        const position = positionsMap.get(item.symbol);
        return sum + (position ? position.market_value : 0);
    }, 0);

    tableBody.innerHTML = '';
    let targetTotalPercentage = 0;

    basket.forEach(item => {
        targetTotalPercentage += item.percentage;
        const position = positionsMap.get(item.symbol);
        const marketValue = position ? position.market_value : 0;
        const actualPercentage = totalBasketValue > 0 ? (marketValue / totalBasketValue) * 100 : 0;

        tableBody.innerHTML += `
            <tr>
                <td>${item.symbol}</td>
                <td><input type="number" class="form-control form-control-sm target-percentage-input" value="${item.percentage}" data-symbol="${item.symbol}" step="0.01"></td>
                <td>${actualPercentage.toFixed(2)}%</td>
                <td>$${marketValue.toFixed(2)}</td>
                <td><button class="btn btn-sm btn-danger remove-asset-btn" data-symbol="${item.symbol}">Remove</button></td>
            </tr>
        `;
    });

    targetTotalEl.textContent = targetTotalPercentage.toFixed(2);
    totalValueEl.textContent = `$${totalBasketValue.toFixed(2)}`;
    executionBasketName.textContent = state.selectedBasket;

    if (Math.round(targetTotalPercentage) !== 100) {
        targetTotalEl.parentElement.classList.add('text-danger');
        errorDiv.textContent = 'Target must be 100%';
        executeBtn.disabled = true;
    } else {
        targetTotalEl.parentElement.classList.remove('text-danger');
        errorDiv.textContent = '';
        executeBtn.disabled = false;
    }
}

function renderAllocationChart() {
    const ctx = document.getElementById('allocation-chart')?.getContext('2d');
    if (!ctx) return;

    const basket = state.baskets[state.selectedBasket] || [];
    const positionsMap = new Map((state.positions && !state.positions.error) ? state.positions.map(p => [p.symbol, p]) : []);
    const totalBasketValue = basket.reduce((sum, item) => {
        const position = positionsMap.get(item.symbol);
        return sum + (position ? position.market_value : 0);
    }, 0);

    const labels = basket.map(item => item.symbol);
    const shouldData = basket.map(item => item.percentage);
    
    const isData = basket.map(item => {
        if (totalBasketValue > 0) {
            const position = positionsMap.get(item.symbol);
            if (position && position.market_value > 0) {
                return (position.market_value / totalBasketValue) * 100;
            }
        }
        return 0;
    });

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
            },
            tooltip: {
                callbacks: {
                    label: function(context) {
                        let label = context.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed !== null) {
                            label += context.parsed.toFixed(2) + '%';
                        }
                        return label;
                    }
                }
            }
        }
    };

    if (state.charts.allocationChart) {
        state.charts.allocationChart.destroy();
    }

    state.charts.allocationChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Soll-Allokation',
                    data: shouldData,
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.5)',
                        'rgba(54, 162, 235, 0.5)',
                        'rgba(255, 206, 86, 0.5)',
                        'rgba(75, 192, 192, 0.5)',
                        'rgba(153, 102, 255, 0.5)',
                        'rgba(255, 159, 64, 0.5)'
                    ],
                    borderColor: 'rgba(255, 255, 255, 0.7)',
                    borderWidth: 1
                },
                {
                    label: 'Ist-Allokation',
                    data: isData,
                    backgroundColor: [
                        'rgba(255, 99, 132, 1)',
                        'rgba(54, 162, 235, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(75, 192, 192, 1)',
                        'rgba(153, 102, 255, 1)',
                        'rgba(255, 159, 64, 1)'
                    ],
                    borderColor: 'rgba(255, 255, 255, 0.7)',
                    borderWidth: 1
                }
            ]
        },
        options: chartOptions
    });
}



// --- Basket Event Listeners & Helpers ---
async function initBasketManager() {
    const resetApiKeyBtn = document.getElementById('reset-api-key-btn');

    resetApiKeyBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset your API key? This will delete your current key and you will have to re-enter it.')) {
            try {
                const response = await fetch('/api/keys/reset', { method: 'POST' });
                if (response.ok) {
                    window.location.reload();
                } else {
                    const errorData = await response.json();
                    alert(`Error: ${errorData.detail || 'Could not reset API key.'}`);
                }
            } catch (error) {
                alert(`An unexpected error occurred: ${error}`);
            }
        }
    });
    const basketSelect = document.getElementById('basket-select');
    const createBtn = document.getElementById('create-basket-btn');
    const deleteBtn = document.getElementById('delete-basket-btn');
    const importBtn = document.getElementById('import-basket-btn');
    const exportBtn = document.getElementById('export-basket-btn');
    const importFileInput = document.getElementById('import-basket-file');
    const addToBasketForm = document.getElementById('add-to-basket-form');
    const assetsTable = document.getElementById('basket-assets-table');
    const executeForm = document.getElementById('execute-basket-form');

    basketSelect.addEventListener('change', () => {
        state.selectedBasket = basketSelect.value;
        render();
    });

    createBtn.addEventListener('click', async () => {
        const name = prompt('Enter a name for the new basket:');
        if (name && !state.baskets[name]) {
            state.baskets[name] = [];
            state.selectedBasket = name;
            await saveBaskets();
            render();
        }
    });

    deleteBtn.addEventListener('click', async () => {
        if (state.selectedBasket && confirm(`Are you sure you want to delete the basket '${state.selectedBasket}'?`)) {
            delete state.baskets[state.selectedBasket];
            state.selectedBasket = Object.keys(state.baskets)[0] || null;
            await saveBaskets();
            render();
        }
    });

    

    addToBasketForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const symbolInput = document.getElementById('basket-asset-symbol');
        const percentageInput = document.getElementById('basket-asset-percentage');
        const symbol = symbolInput.value.toUpperCase();
        const percentage = parseFloat(percentageInput.value);

        if (symbol && percentage > 0 && state.selectedBasket) {
            // Check if the symbol already exists in another basket
            for (const basketName in state.baskets) {
                if (basketName !== state.selectedBasket) {
                    const basket = state.baskets[basketName];
                    if (basket.find(item => item.symbol === symbol)) {
                        alert(`Error: Symbol ${symbol} already exists in basket '${basketName}'.`);
                        return;
                    }
                }
            }

            try {
                const response = await fetch(`/api/validate_ticker/${symbol}`);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || 'Invalid ticker.');
                }

                const basket = state.baskets[state.selectedBasket];
                const existing = basket.find(item => item.symbol === symbol);
                if (existing) {
                    existing.percentage = percentage;
                } else {
                    basket.push({ symbol, percentage });
                }
                await saveBaskets();
                render(); // Re-render to show the new item and update totals
            } catch (error) {
                alert(`Error: ${error.message}`);
            }
        }
        symbolInput.value = '';
        percentageInput.value = '';
    });

    assetsTable.addEventListener('change', async (e) => {
        if (e.target.classList.contains('target-percentage-input')) {
            const symbol = e.target.dataset.symbol;
            const newPercentage = parseFloat(e.target.value);
            const basket = state.baskets[state.selectedBasket];
            const item = basket.find(i => i.symbol === symbol);
            if (item && !isNaN(newPercentage)) {
                item.percentage = newPercentage;
                await saveBaskets();
                renderBasketDetails(); // Re-render to update totals dynamically
            }
        }
    });

    assetsTable.addEventListener('click', async (e) => {
        if (e.target.classList.contains('remove-asset-btn')) {
            const symbolToRemove = e.target.dataset.symbol;
            const basket = state.baskets[state.selectedBasket];
            state.baskets[state.selectedBasket] = basket.filter(item => item.symbol !== symbolToRemove);
            await saveBaskets();
            render(); // Re-render to show removal
        }
    });

    exportBtn.addEventListener('click', () => {
        if (!state.selectedBasket) {
            alert("Please select a basket to export.");
            return;
        }
        const basket = state.baskets[state.selectedBasket];
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(basket, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", state.selectedBasket + ".json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    });

    importBtn.addEventListener('click', () => {
        importFileInput.click();
    });

    importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedBasket = JSON.parse(event.target.result);
                let basketName = file.name.replace(/\.json$/, '');
                
                while (state.baskets[basketName]) {
                    basketName = prompt(`Basket "${basketName}" already exists. Please enter a new name:`, basketName + "_imported");
                    if (basketName === null) return; // User cancelled
                }

                state.baskets[basketName] = importedBasket;
                state.selectedBasket = basketName;
                await saveBaskets();
                render();
            } catch (error) {
                alert("Error importing basket: " + error.message);
            }
        };
        reader.readAsText(file);
        importFileInput.value = ''; // Reset file input
    });

    executeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const totalAmountInput = document.getElementById('basket-total-amount');
        const totalAmount = parseFloat(totalAmountInput.value);
        const resultDiv = document.getElementById('basket-execution-result');

        if (!state.selectedBasket || totalAmount <= 0) {
            resultDiv.innerHTML = '<div class="alert alert-danger">Please select a basket and enter a valid amount.</div>';
            return;
        }

        resultDiv.innerHTML = '<div class="alert alert-info">Executing intelligent buy...</div>';

        try {
            const response = await fetch('/api/baskets/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ basket_name: state.selectedBasket, total_amount: totalAmount })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Execution failed');

            let resultHtml = '<h6>Execution Result</h6>';
            if (result.submitted && result.submitted.length > 0) {
                resultHtml += '<div class="alert alert-success"><strong>Submitted:</strong><ul>';
                result.submitted.forEach(o => { resultHtml += `<li>${o.qty} share(s) of ${o.symbol}</li>`; });
                resultHtml += '</ul></div>';
            }
            if (result.failed && result.failed.length > 0) {
                resultHtml += '<div class="alert alert-danger"><strong>Failed:</strong><ul>';
                result.failed.forEach(o => { resultHtml += `<li>${o.symbol}: ${o.error}</li>`; });
                resultHtml += '</ul></div>';
            }
            if (result.skipped && result.skipped.length > 0) {
                resultHtml += '<div class="alert alert-warning"><strong>Skipped:</strong><ul>';
                result.skipped.forEach(o => { resultHtml += `<li>${o.symbol}: ${o.reason}</li>`; });
                resultHtml += '</ul></div>';
            }

            resultDiv.innerHTML = resultHtml;
            setTimeout(async () => { 
                await fetchAccountInfo(); 
                await fetchPositions();
                render();
            }, 3000); // Wait a bit longer for positions to update
        } catch (error) {
            resultDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        }
    });
}

async function saveBaskets() {
    try {
        const response = await fetch('/api/baskets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baskets: state.baskets })
        });
        if (!response.ok) throw new Error('Failed to save basket on server.');
    } catch (e) {
        console.error("Failed to save baskets:", e);
        alert('Error: Could not save baskets to the server.');
    }
}