document.addEventListener('DOMContentLoaded', () => {
    let originalOrderHistory = [];
    let filteredOrderHistory = [];

    async function loadOrderHistory() {
        try {
            const response = await fetch('/api/orders');
            if (!response.ok) throw new Error((await response.json()).error || 'Failed to fetch order history.');
            originalOrderHistory = await response.json();
            filteredOrderHistory = originalOrderHistory;
            renderOrderHistoryTable(filteredOrderHistory);
        } catch (error) {
            console.error('Error fetching order history:', error);
            const orderHistoryTable = document.getElementById('order-history-table');
            orderHistoryTable.innerHTML = `<tr><td colspan="6" class="alert alert-danger">Could not load order history: ${error.message}</td></tr>`;
        }
    }

    function renderOrderHistoryTable(orderHistory) {
        const orderHistoryTable = document.getElementById('order-history-table');
        if (!orderHistoryTable) return;
        if (orderHistory.length === 0) {
            orderHistoryTable.innerHTML = '<tr><td colspan="6" class="text-center">No orders found.</td></tr>';
            return;
        }
        let tableHtml = '';
        orderHistory.forEach(order => {
            tableHtml += `
                <tr>
                    <td>${order.ticker}</td>
                    <td>${new Date(order.when).toLocaleString()}</td>
                    <td>${order.quantity}</td>
                    <td>${order.basket}</td>
                    <td>$${order.share_price.toFixed(2)}</td>
                    <td>$${order.order_total.toFixed(2)}</td>
                </tr>
            `;
        });
        orderHistoryTable.innerHTML = tableHtml;
    }

    function exportToCsv(data) {
        const headers = ['Ticker', 'Date', 'Quantity', 'Basket', 'Share Price', 'Total Value'];
        const csvContent = [
            headers.join(','),
            ...data.map(row => {
                const d = new Date(row.when);
                const formattedDate = `${d.getFullYear()}-${('0' + (d.getMonth() + 1)).slice(-2)}-${('0' + d.getDate()).slice(-2)} ${('0' + d.getHours()).slice(-2)}:${('0' + d.getMinutes()).slice(-2)}:${('0' + d.getSeconds()).slice(-2)}`;
                return [
                    row.ticker,
                    formattedDate,
                    row.quantity,
                    row.basket,
                    row.share_price.toFixed(2),
                    row.order_total.toFixed(2)
                ].join(',');
            })
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', 'order_history.csv');
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    const filterBtn = document.getElementById('filter-btn');
    filterBtn.addEventListener('click', () => {
        const tickerFilter = document.getElementById('ticker-filter').value.toUpperCase();
        const basketFilter = document.getElementById('basket-filter').value.toUpperCase();
        const startDateFilter = document.getElementById('start-date-filter').value;
        const endDateFilter = document.getElementById('end-date-filter').value;

        const startDate = startDateFilter ? new Date(startDateFilter) : null;
        const endDate = endDateFilter ? new Date(endDateFilter) : null;

        if(startDate) startDate.setHours(0,0,0,0);
        if(endDate) endDate.setHours(23,59,59,999);

        filteredOrderHistory = originalOrderHistory.filter(order => {
            const orderDate = new Date(order.when);
            const tickerMatch = tickerFilter ? order.ticker.toUpperCase().includes(tickerFilter) : true;
            const basketMatch = basketFilter ? order.basket.toUpperCase().includes(basketFilter) : true;
            const dateMatch = (!startDate || orderDate >= startDate) && (!endDate || orderDate <= endDate);
            return tickerMatch && basketMatch && dateMatch;
        });

        renderOrderHistoryTable(filteredOrderHistory);
    });

    const exportBtn = document.getElementById('export-btn');
    exportBtn.addEventListener('click', () => {
        exportToCsv(filteredOrderHistory);
    });

    loadOrderHistory();
    setInterval(loadOrderHistory, 30000);
});