// js/history.js

const historyTableBody = document.querySelector('#history-table tbody');
const noHistoryMessage = document.getElementById('no-history-message');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const HISTORY_KEY = 'earthWatchAlertHistory';

// Function para kunin ang history mula sa localStorage
function getAlertHistory() {
    const history = localStorage.getItem(HISTORY_KEY);
    return history ? JSON.parse(history) : [];
}

// Function para i-display ang history sa table
function displayHistory() {
    const history = getAlertHistory();
    historyTableBody.innerHTML = ''; // Clear existing rows

    if (history.length === 0) {
        noHistoryMessage.style.display = 'block';
        historyTableBody.style.display = 'none'; // Hide table if empty
    } else {
        noHistoryMessage.style.display = 'none';
        historyTableBody.style.display = ''; // Show table

        // Sort history: newest first
        history.sort((a, b) => b.timestamp - a.timestamp); 

        history.forEach(log => {
            const row = historyTableBody.insertRow();
            
            // Format the date and time
            const sentDate = new Date(log.timestamp).toLocaleString();

            row.insertCell(0).textContent = sentDate;
            row.insertCell(1).textContent = log.type;
            row.insertCell(2).textContent = log.sentVia;
            
            // Add class to message cell for styling
            const messageCell = row.insertCell(3);
            messageCell.textContent = log.message;
            messageCell.classList.add('message-col'); 
        });
    }
}

// Event listener para sa "Clear History" button
clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the entire alert history? This cannot be undone.')) {
        localStorage.removeItem(HISTORY_KEY);
        displayHistory(); // Update the table
        alert('Alert history cleared.');
    }
});

// Initial display pagka-load ng page
document.addEventListener('DOMContentLoaded', displayHistory);