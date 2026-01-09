// =============================
// main.js — The Snitch Homepage
// =============================

// === Supabase Setup ===
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = 'https://roqlhnyveyzjriawughf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvcWxobnl2ZXl6anJpYXd1Z2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3ODUwNTQsImV4cCI6MjA3NTM2MTA1NH0.VPie8b5quLIeSc_uEUheJhMXaupJWgxzo3_ib3egMJk'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// === DOM Elements ===
const loginBtn = document.getElementById('login')
const accountBtn = document.getElementById('account')
const createNewBtn = document.getElementById('writer')
const adminDashboardBtn = document.getElementById('admin')
const logoutBtn = document.getElementById('logout')
const sidebar = document.getElementById('accountSidebar')
const closeSidebar = document.getElementById('closeSidebar')
const userEmail = document.getElementById('userEmail')
const avatar = document.getElementById('avatar')
const newsGrid = document.querySelector('.news-grid')
const heroSection = document.querySelector('.hero')
const trendingList = document.querySelector('.trending ul')
const searchInput = document.querySelector('.search-box input')

// overlay fallback
let overlay = document.querySelector('.overlay')
if (!overlay) {
  overlay = document.createElement('div')
  overlay.classList.add('overlay')
  document.body.appendChild(overlay)
}

// global cache
let allArticles = []

// show loading state immediately
if (newsGrid) newsGrid.innerHTML = '<p class="no-results">Loading articles...</p>'

// -----------------------------
// Sidebar events & auth helpers
// -----------------------------
function setupSidebarEvents() {
  accountBtn?.addEventListener('click', () => {
    sidebar.classList.add('open')
    overlay.classList.add('active')
  })

  closeSidebar?.addEventListener('click', () => {
    sidebar.classList.remove('open')
    overlay.classList.remove('active')
  })

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open')
    overlay.classList.remove('active')
  })

  logoutBtn?.addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut()
    if (!error) {
      sidebar.classList.remove('open')
      overlay.classList.remove('active')
      location.reload()
    }
  })
}

async function checkAuthAndRole() {
  try {
    const { data } = await supabase.auth.getSession()
    const session = data?.session ?? null
    const user = session?.user ?? null

    if (!user) {
      loginBtn.style.display = ''
      accountBtn.style.display = 'none'
      adminDashboardBtn.style.display = 'none'
      createNewBtn.style.display = 'none'
      return
    }

    loginBtn.style.display = 'none'
    accountBtn.style.display = ''
    userEmail.textContent = user.email
    avatar.src = user.user_metadata?.avatar_url || 'https://placehold.co/80x80'

    const { data: profile } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single()

    if(window.innerWidth >= 900) {
      if (profile?.role === 'Admin') {
        adminDashboardBtn.style.display = ''
        createNewBtn.style.display = ''
      } else if (profile?.role === 'Writer') {
        createNewBtn.style.display = ''
        adminDashboardBtn.style.display = 'none'
      } else {
        adminDashboardBtn.style.display = 'none'
        createNewBtn.style.display = 'none'
      }
    }
  } catch (err) {
    console.error('Error checking session/role:', err)
  }
}

// -----------------------------
// Helpers
// -----------------------------
function formattedDate(article) {
  if (!article?.created_at) return ''
  // support ISO with time or plain date
  const dateStr = article.created_at.split('T')[0]
  const [year, month, day] = dateStr.split('-')
  return `${month}/${day}/${year}`
}

function extractTitle(html) {
  const temp = document.createElement('div')
  temp.innerHTML = html || ''
  const h1 = temp.querySelector('h1')
  return h1 ? h1.textContent.trim() : 'Untitled'
}

function extractPreview(html) {
  const temp = document.createElement('div')
  temp.innerHTML = html || ''
  const h1 = temp.querySelector('h1')
  if (h1) h1.remove()
  let text = temp.textContent || temp.innerText || ''
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getHeroArticle(articles) {
  if(articles.length == 0) {
    return null;
  }
  let daysAgo = 7;
  let hero = null;
  while (!hero) {
    const dateThreshold = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const recentArticles = articles
      .filter(a => a.created_at > dateThreshold)
      .sort((a, b) => (b.visits || 0) - (a.visits || 0));
    hero = recentArticles[0];
    if (!hero) daysAgo += 7; 
  }
  return hero;
}

function getTrending(articles) {
  if(articles.length == 0) {
    return null;
  }
  let monthsAgo = 1;
  let trending = [];
  while (trending.length === 0) {
    const dateThreshold = new Date();
    dateThreshold.setMonth(dateThreshold.getMonth() - monthsAgo);
    const thresholdStr = dateThreshold.toISOString().split('T')[0];
    trending = [...articles]
      .filter(a => a.created_at > thresholdStr)
      .sort((a, b) => (b.visits || 0) - (a.visits || 0))
      .slice(0, 5);
    if (trending.length === 0) monthsAgo += 1; 
  }
  return trending;
}

// -----------------------------
// Load articles & trending (uses getHeroArticle/getTrending)
 // -----------------------------
async function loadPublishedArticles() {
  try {
    // show loading while fetching
    if (newsGrid) newsGrid.innerHTML = '<p class="no-results">Loading articles...</p>'

    const { data: articles, error } = await supabase
      .from('articles')
      .select('*')
      .not('html', 'is', null)
      .order('created_at', { ascending: false })

    if (error) throw error

    allArticles = articles || []

    if (!allArticles.length) {
      heroSection.innerHTML = ''
      if (newsGrid) newsGrid.innerHTML = '<p class="no-results">No articles found.</p>'
      return
    }

    const heroArticle = getHeroArticle(allArticles)
    const trending = getTrending(allArticles)

    // render hero (if found) and trending and grid
    renderHero(heroArticle)
    renderTrending(trending)

    // render grid: show remaining articles (skip hero if present)
    // We want a grid of articles with hero excluded (heroArticle may be in allArticles[0] or elsewhere)
    const remaining = allArticles.filter(a => a.id !== heroArticle.id)
    await renderMasonry(remaining)
  } catch (err) {
    console.error('Error loading articles:', err)
    if (newsGrid) newsGrid.innerHTML = '<p class="no-results">Error loading articles.</p>'
    heroSection.innerHTML = ''
  }
}

// -----------------------------
// Render hero/trending
// -----------------------------
function renderHero(heroArticle) {
  if (!heroArticle) {
    heroSection.innerHTML = ''
    return
  }
  const title = escapeHtml(extractTitle(heroArticle.html))
  const heroImage = heroArticle.title_image || 'https://placehold.co/1200x600?text=No+Image+Available'
  heroSection.innerHTML = `
    <div class="hero-image" onclick="window.location.href='/article-view/?id=${heroArticle.id}'">
      <img src="${heroImage}" alt="${title}">
    </div>
    <div class="hero-text" onclick="window.location.href='/article-view/?id=${heroArticle.id}'">
      <h2>${title}</h2>
      <div class="meta">${heroArticle.editors || "Anonymous"} · ${formattedDate(heroArticle)} · ${heroArticle.visits || 0} views</div>
    </div>
  `
}

function renderTrending(trending) {
  if (!trending || !trending.length) {
    document.querySelector('.trending').style.display = 'none';
    return
  }
  trendingList.innerHTML = trending
    .map((a, i) => `
      <li onclick="window.location.href='/article-view/?id=${a.id}'">
        <span class="trending-number">${i + 1}</span>
        <span class="trending-title">${escapeHtml(extractTitle(a.html))}</span>
        <span class="trending-views">${a.visits || 0} views</span>
      </li>
    `).join('')
}

// -----------------------------
// Masonry renderer (balances heights)
// -----------------------------
async function renderMasonry(items) {
  if (!newsGrid) return

  // clear container
  newsGrid.innerHTML = ''

  // compute responsive column count
  const containerWidth = newsGrid.clientWidth || newsGrid.getBoundingClientRect().width || window.innerWidth
  const COL_MIN = 300 // px minimum desired column width
  const GAP = 24
  let columns = Math.max(1, Math.floor(containerWidth / (COL_MIN + GAP)))
  columns = Math.min(columns, 4) // cap at 4 columns

  // create columns
  const cols = []
  for (let i = 0; i < columns; i++) {
    const col = document.createElement('div')
    col.className = 'news-column'
    newsGrid.appendChild(col)
    cols.push({ el: col, height: 0 })
  }

  // preload images to estimate aspect ratios
  const itemsWithRatios = await estimateImageRatios(items)

  // approximate constant overhead for non-image parts of the card
  const CONTENT_OVERHEAD = 84 // px (title + meta + padding) — tweakable

  // compute actual column width (account for gaps)
  const totalGapWidth = GAP * (columns - 1)
  const columnWidth = (containerWidth - totalGapWidth) / columns

  // greedy placement
  for (const { item, ratio } of itemsWithRatios) {
    const estImgHeight = ratio && ratio > 0 ? Math.round(columnWidth * ratio) : Math.round(columnWidth * 0.66)
    const estimatedCardHeight = estImgHeight + CONTENT_OVERHEAD

    // pick shortest column
    let minIdx = 0
    let minHeight = cols[0].height
    for (let i = 1; i < cols.length; i++) {
      if (cols[i].height < minHeight) {
        minIdx = i
        minHeight = cols[i].height
      }
    }

    const article = item
    const imgSrc = article.title_image || 'https://placehold.co/600x400?text=No+Image'
    const card = document.createElement('div')
    card.className = 'news-card'
    card.setAttribute('role', 'article')
    card.setAttribute('onclick', `window.location.href='/article-view/?id=${article.id}'`)
    card.innerHTML = `
      <div class="card-image">
        <img src="${imgSrc}" alt="${escapeHtml(extractTitle(article.html))}">
      </div>
      <div class="card-content">
        <h3>${escapeHtml(extractTitle(article.html))}</h3>
        <div class="meta"> ${article.editors || "Anonymous"} · ${formattedDate(article)} · ${article.visits || 0} views</div>
      </div>
    `
    cols[minIdx].el.appendChild(card)
    cols[minIdx].height += estimatedCardHeight
  }
}

// -----------------------------
// Image preloader to compute ratios
// -----------------------------
function estimateImageRatios(items) {
  const placeholder = 'https://placehold.co/600x400?text=No+Image'
  const promises = items.map(item => {
    return new Promise(resolve => {
      const src = item.title_image || placeholder
      const img = new Image()
      let settled = false
      img.onload = () => {
        if (settled) return
        settled = true
        const ratio = (img.naturalHeight && img.naturalWidth) ? (img.naturalHeight / img.naturalWidth) : 0.75
        resolve({ item, ratio })
      }
      img.onerror = () => {
        if (settled) return
        settled = true
        resolve({ item, ratio: 0.75 })
      }
      img.src = src
      // safety timeout
      setTimeout(() => {
        if (!settled) {
          settled = true
          resolve({ item, ratio: 0.75 })
        }
      }, 3000)
    })
  })
  return Promise.all(promises)
}

// -----------------------------
// Search: hero hides, trending + search bar remain
// -----------------------------
function setupSearch() {
  if (!searchInput) return

  const onInput = () => {
    const query = (searchInput.value || '').trim().toLowerCase()
    if (!query) {
      renderHero(getHeroArticle(allArticles))
      renderTrending(getTrending(allArticles))
      // render grid excluding hero
      const remaining = allArticles.filter(a => a.id !== getHeroArticle(allArticles).id)
      renderMasonry(remaining)
      return
    }

    // when searching: hide hero
    heroSection.innerHTML = ''

    // smart search: title OR preview
    const results = allArticles.filter(a => {
      const title = extractTitle(a.html).toLowerCase()
      const preview = extractPreview(a.html).toLowerCase()
      return title.includes(query) || preview.includes(query)
    })

    if (!results.length) {
      newsGrid.innerHTML = '<p class="no-results">No articles found.</p>'
      return
    }

    // render results as masonry (hide hero)
    renderMasonry(results)
  }

  const deb = debounce(onInput, 120)
  searchInput.addEventListener('input', deb)
}

// -----------------------------
// Debounce helper / resize reflow
// -----------------------------
function debounce(fn, wait = 100) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}

const onResizeReflow = debounce(() => {
  const query = (searchInput?.value || '').trim().toLowerCase()
  if (!query) {
    // restore normal view using hero/trending logic
    const hero = getHeroArticle(allArticles)
    renderHero(hero)
    renderTrending(getTrending(allArticles))
    const remaining = allArticles.filter(a => a.id !== hero.id)
    renderMasonry(remaining)
  } else {
    const filtered = allArticles.filter(a => {
      const title = extractTitle(a.html).toLowerCase()
      const preview = extractPreview(a.html).toLowerCase()
      return title.includes(query) || preview.includes(query)
    })
    if (!filtered.length) {
      newsGrid.innerHTML = '<p class="no-results">No articles found.</p>'
    } else {
      renderMasonry(filtered)
    }
  }
}, 180)

window.addEventListener('resize', onResizeReflow)

// -----------------------------
// Events & init
// -----------------------------
loginBtn?.addEventListener('click', async () => {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  })
})

adminDashboardBtn?.addEventListener('click', () => window.location.href = '/admin-dashboard/')
createNewBtn?.addEventListener('click', () => window.location.href = '/drafts-view/')

// Initialize
async function init() {
  setupSidebarEvents()
  await checkAuthAndRole()
  await loadPublishedArticles()
  setupSearch()
}

init()
