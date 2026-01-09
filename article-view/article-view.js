import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = 'https://roqlhnyveyzjriawughf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvcWxobnl2ZXl6anJpYXd1Z2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3ODUwNTQsImV4cCI6MjA3NTM2MTA1NH0.VPie8b5quLIeSc_uEUheJhMXaupJWgxzo3_ib3egMJk'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const titleEl = document.getElementById('title')
const authorEl = document.getElementById('author')
const dateEl = document.getElementById('date')
const viewsEl = document.getElementById('views')
const articleEl = document.getElementById('article')
const returnHomeBtn = document.getElementById('returnHome')
const titleImage = document.getElementById('titleImage')
const adminActionsContainer = document.createElement('div')

adminActionsContainer.style.marginTop = '2rem'
articleEl.parentNode.insertBefore(adminActionsContainer, returnHomeBtn)

let currentUser = null

returnHomeBtn.addEventListener('click', () => (window.location.href = '/'))

const urlParams = new URLSearchParams(window.location.search)
const articleId = urlParams.get('id')

if (!articleId) {
  titleEl.textContent = 'Article Not Found'
  articleEl.innerHTML = '<p>Invalid or missing article ID.</p>'
  throw new Error('Missing ?id= parameter in URL')
}

// --- Load Article for everyone ---
async function loadArticle() {
  try {
    const { data: article, error } = await supabase
      .from('articles')
      .select('*')
      .eq('id', articleId)
      .maybeSingle()

    if (error) throw error
    if (!article) {
      titleEl.textContent = 'Article Not Found'
      articleEl.innerHTML = '<p>This article could not be found.</p>'
      return
    }

    const { title, cleanedHtml } = extractAndCleanArticle(article.html)

    titleEl.textContent = title
    authorEl.textContent = `${article.editors || 'Anonymous'}`
    dateEl.textContent = ` · ${new Date(article.created_at).toLocaleDateString()}`
    viewsEl.textContent = ` · ${article.visits || 0} views`
    articleEl.innerHTML = cleanedHtml

    if (article.title_image) {
      titleImage.src = article.title_image
      titleImage.style.display = 'block'
    }

    incrementViews(article.id)

    // Check if current user is admin to render delete button
    await checkAdminAndRenderDelete(article.id)
  } catch (err) {
    console.error('Error loading article:', err)
    articleEl.innerHTML = '<p>Error loading article.</p>'
  }
}

// --- Increment views ---
async function incrementViews(id) {
  await supabase.rpc('increment_views', { article_id: parseInt(id) })
}

// --- Extract title ---
function extractAndCleanArticle(html) {
  const temp = document.createElement('div')
  temp.innerHTML = html
  const h1 = temp.querySelector('h1')
  const title = h1 ? h1.textContent.trim() : 'Untitled'
  if (h1) h1.remove()
  return { title, cleanedHtml: temp.innerHTML }
}

// --- Check if admin and render delete ---
async function checkAdminAndRenderDelete(articleId) {
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData?.session ?? null
    if (!session) return // not logged in, no admin

    currentUser = session.user

    // Check user_roles table
    const { data: rolesData, error: rolesErr } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)

    if (rolesErr || !rolesData) return
    if (!rolesData.some(r => r.role === 'Admin')) return // not admin

    // Render delete button
    const deleteBtn = document.createElement('button')
    deleteBtn.textContent = 'Delete Article'
    deleteBtn.className = 'return-btn'
    deleteBtn.style.background = '#dc2626'
    deleteBtn.style.color = '#fff'
    deleteBtn.style.fontSize = '0.9rem'

    deleteBtn.addEventListener('click', async () => {
      const confirmed = confirm(
        '⚠️ Are you sure you want to DELETE this article? This action cannot be undone.'
      )
      if (!confirmed) return
      deleteArticleImages(articleEl.innerHTML, "Images", titleImage.src);

      const { error } = await supabase.from('articles').delete().eq('id', articleId)
      if (error) {
        alert('Error deleting article')
        console.error(error)
      } else {
        alert('Article deleted')
        window.location.href = '/'
      }
    })

    adminActionsContainer.appendChild(deleteBtn)
  } catch (err) {
    console.error('Error checking admin role', err)
  }
}

async function deleteArticleImages(html, bucket = 'Images', title_image = null) {
  if (!html) return

  // Create a temporary div to parse HTML
  const temp = document.createElement('div')
  temp.innerHTML = html

  // Get all <img> elements
  const imgElements = Array.from(temp.querySelectorAll('img'))

  if (imgElements.length === 0) return

  // Extract bucket paths from src URLs
  const pathsToDelete = imgElements
    .map(img => {
      try {
        const url = new URL(img.src)
        // Assuming the path after /bucket-name/ is the file path
        const match = url.pathname.match(new RegExp(`/${bucket}/(.+)$`))
        return match ? decodeURIComponent(match[1]) : null
      } catch {
        return null
      }
    })
    .filter(Boolean) // Remove nulls

  if (pathsToDelete.length === 0) return
  if(title_image) pathsToDelete.push((title_image.match(/Images\/(.+)$/) || [])[1]);
  console.log(pathsToDelete);

  // Delete files from Supabase Storage
  const { data, error } = await supabase.storage.from(bucket).remove(pathsToDelete)

  if (error) {
    console.error('Error deleting images from storage:', error)
  } else {
    console.log('Deleted images:', pathsToDelete)
  }
}

// --- INIT ---
loadArticle()
