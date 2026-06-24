// Global Data State
let dashboardData = null;
let charts = {};

// Google Font Family for Charts
const chartFontFamily = "'Inter', 'Noto Sans Thai', sans-serif";

// Primary Dashboard Colors
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
  document.getElementById('filter-start-time').addEventListener('change', handleFilterChange);
  document.getElementById('filter-end-time').addEventListener('change', handleFilterChange);
  document.getElementById('search-input').addEventListener('input', handleSearch);
  document.getElementById('btn-export-pdf').addEventListener('click', () => window.print());
  document.getElementById('btn-export-json').addEventListener('click', downloadDataJSON);
});

// Fetch Aggregated Log Data
async function fetchData() {
  try {
    const response = await fetch('aggregated_data.json?t=' + new Date().getTime());
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

// Initialize the Dashboard
function initDashboard() {
  if (!dashboardData) return;
  
  // สร้างตัวเลือกวันที่ในเมนู Dropdown และ ป้ายอัปเดตล่าสุด แบบ Dynamic ตามข้อมูลจริง
  populateDateDropdown();
  
  handleFilterChange(); // Perform initial calculations and chart drawing
}

// เจนเนอเรตตัวเลือกวันที่ตามข้อมูลที่มีจริงในไฟล์ JSON อัตโนมัติ
function populateDateDropdown() {
  const dateSelect = document.getElementById('filter-date');
  if (!dateSelect) return;
  
  // ดึงรายชื่อวันจากข้อมูลดิบ (ดึงจาก ดัชนี .dates หรือ คีย์ย่อยของ .hourly_data)
  const dates = dashboardData.dates || Object.keys(dashboardData.hourly_data || {});
  
  // เคลียร์เมนูเดิมที่เป็น Hardcode ออกให้หมด
  dateSelect.innerHTML = '';
  
  // สร้างตัวเลือกแรก: แสดงภาพรวมสะสมทั้งหมด
  const allOption = document.createElement('option');
  allOption.value = 'all';
  allOption.textContent = `แสดงภาพรวมสะสม (${dates.length} วัน)`;
  dateSelect.appendChild(allOption);
  
  // วนลูปนำวันที่จริงจากเอ็กเซลมาเพิ่มใน Dropdown
  dates.forEach(date => {
    const option = document.createElement('option');
    option.value = date;
    option.textContent = date; // แสดงฟอร์แมตวันที่ตามไฟล์จริง
    dateSelect.appendChild(option);
  });
  
  // อัปเดตตัวเลขป้าย 'อัปเดตล่าสุด' ที่หัวเว็บขวาบน โดยอิงจากวันที่ล่าสุดในไฟล์ข้อมูล
  const timeBadgeSpan = document.querySelector('.time-badge span');
  if (timeBadgeSpan && dates.length > 0) {
    const latestDate = dates[dates.length - 1]; // เลือกวันสุดท้ายในชุดข้อมูลที่เรียงแล้ว
    timeBadgeSpan.innerText = `อัปเดตล่าสุด: ${latestDate}`;
  }
}

// Core Filtering Logic (Date + Time Range)
function getFilteredData(dateFilter, startHour, endHour) {
  let totalRows = 0;
  const usersSet = new Set();
  const sitesSet = new Set();
  const sitetypes = {};
  const provinces = {};
  const positions = {};
  const sao = {};
  const hourlyTrends = Array(24).fill(0);
  
  // Track user login frequency in the filtered scope
  const userFrequencyMap = new Map();
  
  const datesToProcess = dateFilter === 'all' ? (dashboardData.dates || Object.keys(dashboardData.hourly_data || {})) : [dateFilter];
  
  datesToProcess.forEach(d => {
    const dayData = dashboardData.hourly_data[d];
    if (!dayData) return;
    
    for (let h = 0; h < 24; h++) {
      const hourStr = String(h);
      const hourData = dayData[hourStr];
      if (!hourData) continue;
      
      // Build full hourly trends for plotting
      hourlyTrends[h] += hourData.rows;
      
      // Filter by hour range for metrics and distributions
      if (h >= startHour && h < endHour) {
        totalRows += hourData.rows;
        
        // Add users and sites to unique sets
        hourData.users.forEach(uid => {
          usersSet.add(uid);
          userFrequencyMap.set(uid, (userFrequencyMap.get(uid) || 0) + 1);
        });
        hourData.sites.forEach(sid => sitesSet.add(sid));
        
        // Accumulate sitetypes
        for (const [k, v] of Object.entries(hourData.sitetypes)) {
          sitetypes[k] = (sitetypes[k] || 0) + v;
        }
        
        // Accumulate provinces
        for (const [k, v] of Object.entries(hourData.provinces)) {
          provinces[k] = (provinces[k] || 0) + v;
        }
        
        // Accumulate positions
        for (const [k, v] of Object.entries(hourData.positions)) {
          positions[k] = (positions[k] || 0) + v;
        }
        
        // Accumulate sao
        for (const [k, v] of Object.entries(hourData.sao)) {
          sao[k] = (sao[k] || 0) + v;
        }
      }
    }
  });
  
  // Calculate dynamic user engagement bins
  const userBins = {
    "1 time": 0,
    "2-5 times": 0,
    "6-10 times": 0,
    "11-20 times": 0,
    "21-50 times": 0,
    "51+ times": 0
  };
  
  userFrequencyMap.forEach((count) => {
    if (count === 1) userBins["1 time"]++;
    else if (count >= 2 && count <= 5) userBins["2-5 times"]++;
    else if (count >= 6 && count <= 10) userBins["6-10 times"]++;
    else if (count >= 11 && count <= 20) userBins["11-20 times"]++;
    else if (count >= 21 && count <= 50) userBins["21-50 times"]++;
    else userBins["51+ times"]++;
  });
  
  return {
    totalRows,
    uniqueUsers: usersSet.size,
    uniqueSites: sitesSet.size,
    sitetypes,
    provinces,
    positions,
    sao,
    hourlyTrends,
    userBins
  };
}

// Update KPI Metric Cards
function updateKPIs(filteredData) {
  const totalEmailsEl = document.getElementById('kpi-total-emails');
  const activeUsersEl = document.getElementById('kpi-active-users');
  const activeSitesEl = document.getElementById('kpi-active-sites');
  const stickinessEl = document.getElementById('kpi-stickiness');
  
  animateCounter(totalEmailsEl, filteredData.totalRows);
  animateCounter(activeUsersEl, filteredData.uniqueUsers);
  animateCounter(activeSitesEl, filteredData.uniqueSites);
  
  if (stickinessEl) {
    // Dynamic stickiness calculation based on the current hour range
    const totalUsers = filteredData.uniqueUsers;
    if (totalUsers === 0) {
      stickinessEl.innerText = "0.0%";
      return;
    }
    
    const singleTimeUsers = filteredData.userBins["1 time"];
    const stickinessPct = (((totalUsers - singleTimeUsers) / totalUsers) * 100).toFixed(1);
    stickinessEl.innerText = `${stickinessPct}%`;
  }
}

// Counter Animation Logic
function animateCounter(element, targetValue) {
  let startTimestamp = null;
  const duration = 800; // 0.8 seconds animation
  
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

// 1. Hourly Trend Area Chart (updates to show only the selected hour range)
function initHourlyChart(filteredData, startHour, endHour) {
  let categories = [];
  let seriesData = [];
  
  for (let h = startHour; h < endHour; h++) {
    categories.push(`${String(h).padStart(2, '0')}:00`);
    seriesData.push(filteredData.hourlyTrends[h]);
  }
  
  const options = {
    series: [{
      name: 'ปริมาณธุรกรรม',
      data: seriesData
    }],
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

// 1.5. Rolling 3-Hour Trend Area Chart
function initRollingChart(filteredData, startHour, endHour) {
  let categories = [];
  let seriesData = [];
  
  const maxStartHour = Math.min(endHour - 1, 21);
  for (let h = startHour; h <= maxStartHour; h++) {
    const nextThreeHour = (h + 3) % 24;
    categories.push(`${String(h).padStart(2, '0')}:00 - ${String(nextThreeHour).padStart(2, '0')}:00`);
    
    const h1 = filteredData.hourlyTrends[h] || 0;
    const h2 = filteredData.hourlyTrends[(h + 1) % 24] || 0;
    const h3 = filteredData.hourlyTrends[(h + 2) % 24] || 0;
    seriesData.push(h1 + h2 + h3);
  }
  
  const options = {
    series: [{
      name: 'ปริมาณธุรกรรมสะสม 3 ชม.',
      data: seriesData
    }],
    chart: {
      type: 'area',
      height: 320,
      fontFamily: chartFontFamily,
      toolbar: { show: false },
      zoom: { enabled: false }
    },
    colors: [chartColors.secondary],
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
  
  if (charts.rolling) {
    charts.rolling.updateOptions(options);
  } else {
    charts.rolling = new ApexCharts(document.querySelector("#chart-rolling"), options);
    charts.rolling.render();
  }
}

// 2. Organization Type Column Bar Chart
function initSitetypeChart(filteredData) {
  const dist = filteredData.sitetypes;
  
  // Sort sitetypes by transaction volume (value) in descending order
  const sortedSitetypes = Object.entries(dist)
    .sort((a, b) => b[1] - a[1]);
    
  const labels = sortedSitetypes.map(item => item[0]);
  const seriesData = sortedSitetypes.map(item => item[1]);
  
  const options = {
    series: [{
      name: 'ปริมาณธุรกรรม',
      data: seriesData
    }],
    chart: {
      type: 'bar',
      height: 320,
      fontFamily: chartFontFamily,
      toolbar: { show: false }
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: '50%',
        distributed: true,
        dataLabels: {
          position: 'top' // place labels on top of the bars
        }
      }
    },
    colors: chartColors.colorsList,
    dataLabels: {
      enabled: true,
      formatter: function (val) {
        if (val >= 1000) {
          return (val / 1000).toFixed(1) + 'k';
        }
        return val.toString();
      },
      offsetY: -20,
      style: {
        fontSize: '11px',
        fontWeight: '700',
        colors: [chartColors.primary]
      }
    },
    xaxis: {
      categories: labels,
      labels: {
        style: {
          colors: chartColors.foreground,
          fontSize: '11px',
          fontWeight: 600
        }
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

// 3. Top Provinces Horizontal Bar Chart (shows top 10 dynamically)
function initProvinceChart(filteredData) {
  const dist = filteredData.provinces;
  
  // Sort and take top 10 provinces in this time range
  const sortedProvinces = Object.entries(dist)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
    
  const categories = sortedProvinces.map(p => p[0]);
  const seriesData = sortedProvinces.map(p => p[1]);
  
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
    dataLabels: {
      enabled: true,
      formatter: function (val) {
        return val.toLocaleString('th-TH');
      },
      style: {
        fontSize: '11px',
        fontWeight: '700',
        colors: ['#ffffff']
      }
    },
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

// 4. Audit Connection Donut Chart
function initSaoChart(filteredData) {
  const dist = filteredData.sao;
  const labels = Object.keys(dist);
  const series = Object.values(dist);
  
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
      formatter: function (val) {
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
function initEngagementChart(filteredData) {
  const el = document.querySelector("#chart-engagement");
  if (!el) return;
  
  const bins = filteredData.userBins;
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

// Populate the Positions Table (shows top 15 dynamically based on time range)
function populateTopPositionsTable(positionsData, totalLogins) {
  const tableBody = document.querySelector('#table-positions-body');
  tableBody.innerHTML = '';
  
  const sortedPositions = Object.entries(positionsData)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name, count]) => ({ name, count }));
    
  if (sortedPositions.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">ไม่มีข้อมูลในช่วงเวลาที่เลือก</td></tr>`;
    return;
  }
  
  sortedPositions.forEach((pos, index) => {
    const percentage = totalLogins > 0 ? ((pos.count / totalLogins) * 100).toFixed(1) : "0.0";
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
            <span style="font-size: 0.775rem; color: var(--color-text-muted); width: 45px; text-align: right;">${percentage}%</span>
          </div>
        </td>
      </tr>
    `;
    tableBody.insertAdjacentHTML('beforeend', rowHtml);
  });
}

// Handle Filter Changes (Date + Time range change)
function handleFilterChange() {
  const dateFilter = document.getElementById('filter-date').value;
  let startHour = parseInt(document.getElementById('filter-start-time').value);
  let endHour = parseInt(document.getElementById('filter-end-time').value);
  
  // Guard clause: ensure startHour is less than endHour
  if (startHour >= endHour) {
    document.getElementById('filter-end-time').value = startHour + 1;
    endHour = startHour + 1;
  }
  
  // Show loader overlay briefly for the transition
  const loader = document.getElementById('loader');
  document.getElementById('loader-text').innerText = 'กำลังคำนวณและประมวลผลข้อมูลช่วงเวลา...';
  loader.style.opacity = '0.7';
  loader.style.display = 'flex';
  
  setTimeout(() => {
    // 1. Process data for current filters
    const filteredData = getFilteredData(dateFilter, startHour, endHour);
    
    // 2. Update UI components
    updateKPIs(filteredData);
    initHourlyChart(filteredData, startHour, endHour);
    initRollingChart(filteredData, startHour, endHour);
    initSitetypeChart(filteredData);
    initProvinceChart(filteredData);
    initSaoChart(filteredData);
    initEngagementChart(filteredData);
    populateTopPositionsTable(filteredData.positions, filteredData.totalRows);
    
    // Search filter check in case search bar is not empty
    handleSearch();
    
    // 3. Hide loader
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 200);
  }, 100);
}

// Handle Search Filter inside the Positions Table
function handleSearch() {
  const query = document.getElementById('search-input').value.toLowerCase().trim();
  const rows = document.querySelectorAll('#table-positions-body tr');
  
  rows.forEach(row => {
    if (row.cells.length < 2) return; // Skip empty row warning
    const positionName = row.cells[1].innerText.toLowerCase();
    if (positionName.includes(query)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

// Export Filtered Data as JSON File
function downloadDataJSON() {
  if (!dashboardData) return;
  
  const dateFilter = document.getElementById('filter-date').value;
  const startHour = parseInt(document.getElementById('filter-start-time').value);
  const endHour = parseInt(document.getElementById('filter-end-time').value);
  
  const filteredData = getFilteredData(dateFilter, startHour, endHour);
  
  const exportData = {
    description: `Login volume log report for date=${dateFilter} and hours=${startHour}:00-${endHour}:00`,
    date: dateFilter,
    startHour: `${startHour}:00`,
    endHour: `${endHour}:00`,
    kpis: {
      total_rows: filteredData.totalRows,
      unique_users: filteredData.uniqueUsers,
      unique_sites: filteredData.uniqueSites
    },
    sitetype_dist: filteredData.sitetypes,
    top_provinces: filteredData.provinces,
    top_positions: filteredData.positions,
    sao_dist: filteredData.sao
  };
  
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `login_volume_report_${dateFilter}_hours_${startHour}_to_${endHour}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}