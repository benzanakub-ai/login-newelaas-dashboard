// Global Data State
let dashboardData = null;
let charts = {};

// Google Font Family for Charts
const chartFontFamily = "'Inter', 'Noto Sans Thai', sans-serif";

// Primary Dashboard Palette
const chartColors = {
  primary: '#1e40af',     // Deep Royal Blue
  secondary: '#3b82f6',   // Sky Blue
  accent: '#d97706',      // Amber Accent
  success: '#10b981',     // Emerald
  danger: '#dc2626',      // Red
  muted: '#94a3b8',       // Slate Grey
  colorsList: ['#1e40af', '#3b82f6', '#d97706', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6']
};

document.addEventListener('DOMContentLoaded', () => {
  // Load data asynchronously
  fetchData();
  
  // Set up navigation tab listeners
  initTabs();
  
  // Set up event listeners for filters
  document.getElementById('filter-date').addEventListener('change', handleFilterChange);
  document.getElementById('search-input').addEventListener('input', handleSearch);
  document.getElementById('btn-export-pdf').addEventListener('click', () => window.print());
  document.getElementById('btn-export-json').addEventListener('click', downloadDataJSON);
});

// Fetch Aggregated Log Data
async function fetchData() {
  try {
    const response = await fetch('aggregated_data.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    dashboardData = await response.json();
    
    // Hide loader overlay with a smooth transition
    const loader = document.getElementById('loader');
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 300);
    
    // Initialize Dashboard
    initDashboard();
  } catch (error) {
    console.error('Error fetching aggregated data:', error);
    document.getElementById('loader-text').innerText = 'เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาตรวจสอบไฟล์ aggregated_data.json';
    document.getElementById('spinner').style.animationPlayState = 'paused';
    document.getElementById('spinner').style.borderTopColor = 'var(--color-destructive)';
  }
}

// Tab navigation handler
function initTabs() {
  const tabs = document.querySelectorAll('.tab-button');
  const contents = document.querySelectorAll('.tab-content');
  
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      
      // Update active tab buttons
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update active content panels
      contents.forEach(c => {
        c.classList.remove('active');
        if (c.id === target) {
          c.classList.add('active');
        }
      });
      
      // If returning to overview tab, trigger window resize to refresh ApexCharts layout
      if (target === 'tab-overview') {
        window.dispatchEvent(new Event('resize'));
      }
    });
  });
}

// Initialize the KPI values, Charts, and Data Tables
function initDashboard() {
  if (!dashboardData) return;
  
  updateKPIs('all');
  initHourlyChart('all');
  initSitetypeChart('all');
  initProvinceChart('all');
  initSaoChart('all');
  initEngagementChart();
  populateTopPositionsTable(dashboardData.top_positions);
}

// Update KPI metric cards dynamically
function updateKPIs(dateFilter) {
  const totalEmailsEl = document.getElementById('kpi-total-emails');
  const activeUsersEl = document.getElementById('kpi-active-users');
  const activeSitesEl = document.getElementById('kpi-active-sites');
  const stickinessEl = document.getElementById('kpi-stickiness');
  
  let totalLogs = 0;
  let uniqueUsers = 0;
  let uniqueSites = 0;
  
  if (dateFilter === 'all') {
    totalLogs = dashboardData.overall.total_rows;
    uniqueUsers = dashboardData.overall.unique_users;
    uniqueSites = dashboardData.overall.unique_sites;
  } else {
    const stats = dashboardData.overall.daily_stats[dateFilter];
    totalLogs = stats.total_rows;
    uniqueUsers = stats.unique_users;
    uniqueSites = stats.unique_sites;
  }
  
  // Animate counters for premium feel
  animateCounter(totalEmailsEl, totalLogs);
  animateCounter(activeUsersEl, uniqueUsers);
  animateCounter(activeSitesEl, uniqueSites);
  
  // Calculate retention rate (User engagement stickiness)
  // Sticky users = total users who performed >1 transactions (all bins except "1 time")
  const totalUsersGlobal = dashboardData.overall.unique_users;
  const singleTimeUsers = dashboardData.user_bins["1 time"];
  const stickinessPct = ((totalUsersGlobal - singleTimeUsers) / totalUsersGlobal * 100).toFixed(1);
  stickinessEl.innerText = `${stickinessPct}%`;
}

// Counter animation logic
function animateCounter(element, targetValue) {
  let startTimestamp = null;
  const duration = 1000; // 1 second animation
  
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    const currentValue = Math.floor(progress * targetValue);
    element.innerText = currentValue.toLocaleString('th-TH');
    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      element.innerText = targetValue.toLocaleString('th-TH');
    }
  };
  
  window.requestAnimationFrame(step);
}

// 1. Hourly Trend Area Chart
function initHourlyChart(dateFilter) {
  let seriesData = [];
  let categories = Array.from({length: 24}, (_, i) => `${String(i).padStart(2, '0')}:00`);
  
  if (dateFilter === 'all') {
    // Show combined hourly distribution
    seriesData = [
      {
        name: 'ทราฟฟิกรวม (3 วัน)',
        data: dashboardData.hourly_trends.combined
      }
    ];
  } else {
    seriesData = [
      {
        name: `ธุรกรรมวันที่ ${dateFilter}`,
        data: dashboardData.hourly_trends[dateFilter]
      }
    ];
  }
  
  const options = {
    series: seriesData,
    chart: {
      type: 'area',
      height: 350,
      fontFamily: chartFontFamily,
      toolbar: { show: false },
      zoom: { enabled: false }
    },
    colors: [chartColors.primary],
    dataLabels: { enabled: false },
    stroke: {
      curve: 'smooth',
      width: 3
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.05,
        stops: [0, 90, 100]
      }
    },
    grid: {
      borderColor: 'var(--color-border)',
      strokeDashArray: 4,
      padding: { left: 10, right: 10 }
    },
    xaxis: {
      categories: categories,
      labels: {
        style: { colors: chartColors.muted }
      }
    },
    yaxis: {
      labels: {
        style: { colors: chartColors.muted },
        formatter: function (val) {
          return val.toLocaleString('th-TH');
        }
      }
    },
    tooltip: {
      y: {
        formatter: function (val) {
          return `${val.toLocaleString('th-TH')} ครั้ง`;
        }
      }
    }
  };
  
  if (charts.hourly) {
    charts.hourly.updateOptions(options);
  } else {
    charts.hourly = new ApexCharts(document.querySelector("#chart-hourly"), options);
    charts.hourly.render();
  }
}

// 2. Organization Type Donut Chart
function initSitetypeChart(dateFilter) {
  let series = [];
  let labels = [];
  
  if (dateFilter === 'all') {
    const dist = dashboardData.sitetype_dist;
    labels = Object.keys(dist);
    series = Object.values(dist);
  } else {
    const dist = dashboardData.sitetype_by_date[dateFilter];
    labels = Object.keys(dist);
    series = Object.values(dist);
  }
  
  const options = {
    series: series,
    chart: {
      type: 'donut',
      height: 320,
      fontFamily: chartFontFamily
    },
    labels: labels,
    colors: chartColors.colorsList,
    legend: {
      position: 'bottom',
      fontSize: '12px',
      labels: { colors: chartColors.foreground }
    },
    plotOptions: {
      pie: {
        donut: {
          size: '70%',
          labels: {
            show: true,
            total: {
              show: true,
              label: 'ธุรกรรมทั้งหมด',
              formatter: function (w) {
                const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                return total.toLocaleString('th-TH') + ' ครั้ง';
              },
              style: {
                fontSize: '14px',
                fontWeight: '600',
                color: chartColors.muted
              }
            }
          }
        }
      }
    },
    dataLabels: { enabled: false },
    tooltip: {
      y: {
        formatter: function (val) {
          return `${val.toLocaleString('th-TH')} ครั้ง`;
        }
      }
    }
  };
  
  if (charts.sitetype) {
    charts.sitetype.updateOptions(options);
  } else {
    charts.sitetype = new ApexCharts(document.querySelector("#chart-sitetype"), options);
    charts.sitetype.render();
  }
}

// 3. Top Provinces Horizontal Bar Chart
function initProvinceChart(dateFilter) {
  let seriesData = [];
  let categories = [];
  
  if (dateFilter === 'all') {
    const dist = dashboardData.top_provinces;
    categories = Object.keys(dist);
    seriesData = Object.values(dist);
  } else {
    const dist = dashboardData.province_by_date[dateFilter];
    categories = Object.keys(dist);
    seriesData = Object.values(dist);
  }
  
  const options = {
    series: [{
      name: 'ปริมาณธุรกรรม',
      data: seriesData
    }],
    chart: {
      type: 'bar',
      height: 340,
      fontFamily: chartFontFamily,
      toolbar: { show: false }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        horizontal: true,
        barHeight: '75%',
        distributed: true
      }
    },
    colors: chartColors.colorsList,
    dataLabels: { enabled: false },
    xaxis: {
      categories: categories,
      labels: {
        style: { colors: chartColors.muted },
        formatter: function (val) {
          return val.toLocaleString('th-TH');
        }
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: chartColors.foreground,
          fontWeight: 500
        }
      }
    },
    grid: {
      borderColor: 'var(--color-border)',
      strokeDashArray: 4
    },
    legend: { show: false },
    tooltip: {
      y: {
        formatter: function (val) {
          return `${val.toLocaleString('th-TH')} ครั้ง`;
        }
      }
    }
  };
  
  if (charts.province) {
    charts.province.updateOptions(options);
  } else {
    charts.province = new ApexCharts(document.querySelector("#chart-province"), options);
    charts.province.render();
  }
}

// 4. Audit connection (สตง.) Donut Chart
function initSaoChart(dateFilter) {
  let series = [];
  let labels = [];
  
  if (dateFilter === 'all') {
    const dist = dashboardData.sao_dist;
    labels = Object.keys(dist);
    series = Object.values(dist);
  } else {
    const dist = dashboardData.sao_by_date[dateFilter];
    labels = Object.keys(dist);
    series = Object.values(dist);
  }
  
  const options = {
    series: series,
    chart: {
      type: 'pie',
      height: 280,
      fontFamily: chartFontFamily
    },
    labels: labels,
    colors: [chartColors.primary, chartColors.accent],
    legend: {
      position: 'bottom',
      labels: { colors: chartColors.foreground }
    },
    dataLabels: {
      enabled: true,
      formatter: function (val, opts) {
        // Since СТГ is extremely small, display actual count or percentage with 3 decimal points
        return val < 1 ? val.toFixed(3) + "%" : val.toFixed(1) + "%";
      }
    },
    tooltip: {
      y: {
        formatter: function (val) {
          return `${val.toLocaleString('th-TH')} ครั้ง`;
        }
      }
    }
  };
  
  if (charts.sao) {
    charts.sao.updateOptions(options);
  } else {
    charts.sao = new ApexCharts(document.querySelector("#chart-sao"), options);
    charts.sao.render();
  }
}

// 5. User Engagement Vertical Column Chart
function initEngagementChart() {
  const bins = dashboardData.user_bins;
  const categories = Object.keys(bins);
  const seriesData = Object.values(bins);
  
  const options = {
    series: [{
      name: 'จำนวนผู้ใช้งาน',
      data: seriesData
    }],
    chart: {
      type: 'bar',
      height: 280,
      fontFamily: chartFontFamily,
      toolbar: { show: false }
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: '55%',
        distributed: true
      }
    },
    colors: chartColors.colorsList,
    dataLabels: { enabled: false },
    xaxis: {
      categories: categories,
      labels: {
        style: { colors: chartColors.muted }
      }
    },
    yaxis: {
      labels: {
        style: { colors: chartColors.muted },
        formatter: function (val) {
          return val.toLocaleString('th-TH');
        }
      }
    },
    grid: {
      borderColor: 'var(--color-border)',
      strokeDashArray: 4
    },
    legend: { show: false },
    tooltip: {
      y: {
        formatter: function (val) {
          return `${val.toLocaleString('th-TH')} คน`;
        }
      }
    }
  };
  
  if (charts.engagement) {
    charts.engagement.updateOptions(options);
  } else {
    charts.engagement = new ApexCharts(document.querySelector("#chart-engagement"), options);
    charts.engagement.render();
  }
}

// Populate the detailed Roles / Positions Table
function populateTopPositionsTable(positionsData) {
  const tableBody = document.querySelector('#table-positions-body');
  tableBody.innerHTML = '';
  
  const positionsArray = Object.entries(positionsData).map(([name, count]) => ({ name, count }));
  // Find max count for progress bars
  const maxCount = Math.max(...positionsArray.map(p => p.count));
  
  positionsArray.forEach((pos, index) => {
    const percentage = ((pos.count / maxCount) * 100).toFixed(0);
    const rowHtml = `
      <tr>
        <td style="width: 60px; font-weight: 700; color: var(--color-primary);">${index + 1}</td>
        <td>
          <div style="font-weight: 600;">${pos.name}</div>
        </td>
        <td style="width: 140px; font-weight: 700; text-align: right;">${pos.count.toLocaleString('th-TH')}</td>
        <td style="width: 250px;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <div style="flex-grow: 1; height: 8px; background: #e2e8f0; border-radius: 4px; overflow: hidden;">
              <div style="width: ${percentage}%; height: 100%; background: var(--color-primary); border-radius: 4px;"></div>
            </div>
            <span style="font-size: 0.775rem; color: var(--color-text-muted); width: 30px; text-align: right;">${percentage}%</span>
          </div>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML('beforeend', rowHtml);
  });
}

// Handle Dropdown Filter Changes
function handleFilterChange() {
  const dateFilter = document.getElementById('filter-date').value;
  
  // Show loader briefly to indicate loading transition
  const loader = document.getElementById('loader');
  document.getElementById('loader-text').innerText = 'กำลังคำนวณและดึงข้อมูลตัวกรอง...';
  loader.style.opacity = '0.7';
  loader.style.display = 'flex';
  
  setTimeout(() => {
    updateKPIs(dateFilter);
    initHourlyChart(dateFilter);
    initSitetypeChart(dateFilter);
    initProvinceChart(dateFilter);
    initSaoChart(dateFilter);
    
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 200);
  }, 200);
}

// Handle Real-time Search Filter for Positions Table
function handleSearch() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const rows = document.querySelectorAll('#table-positions-body tr');
  
  rows.forEach(row => {
    const positionName = row.cells[1].innerText.toLowerCase();
    if (positionName.includes(query)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// Export Filtered data as JSON file download
function downloadDataJSON() {
  if (!dashboardData) return;
  
  const dateFilter = document.getElementById('filter-date').value;
  let exportData = {};
  
  if (dateFilter === 'all') {
    exportData = {
      description: "Email volume log report (All 3 days)",
      overall: dashboardData.overall,
      hourly_trends: dashboardData.hourly_trends.combined,
      sitetype_dist: dashboardData.sitetype_dist,
      top_provinces: dashboardData.top_provinces,
      top_positions: dashboardData.top_positions,
      sao_dist: dashboardData.sao_dist
    };
  } else {
    exportData = {
      description: `Email volume log report for date ${dateFilter}`,
      date: dateFilter,
      stats: dashboardData.overall.daily_stats[dateFilter],
      hourly_trends: dashboardData.hourly_trends[dateFilter],
      sitetype_dist: dashboardData.sitetype_by_date[dateFilter],
      top_provinces: dashboardData.province_by_date[dateFilter],
      sao_dist: dashboardData.sao_by_date[dateFilter]
    };
  }
  
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `email_volume_report_${dateFilter}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
