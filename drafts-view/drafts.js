/* drafts.js
   - lists current user's drafts
   - if user is Admin, lists other users' drafts in second column
   - Create New immediately inserts a draft and opens editor
   - Uses example Supabase project/key (anon)
*/
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = "https://roqlhnyveyzjriawughf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvcWxobnl2ZXl6anJpYXd1Z2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3ODUwNTQsImV4cCI6MjA3NTM2MTA1NH0.VPie8b5quLIeSc_uEUheJhMXaupJWgxzo3_ib3egMJk";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const myDraftsEl = document.getElementById("myDrafts");
const otherDraftsEl = document.getElementById("otherDrafts");
const otherBlock = document.getElementById("otherBlock");
const newBtn = document.getElementById("newBtn");
const refreshBtn = document.getElementById("refreshBtn");
const msgEl = document.getElementById("msg");

let currentUser = null;
let userRole = null; // 'Writer' | 'Admin' | null

// helper to escape HTML in small places
function escapeHtml(s = "") {
    return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// extract possible title from HTML (first h1 or first sensible text)
function extractTitleFromHtml(html) {
    if (!html) return null;
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    const h1 = tmp.querySelector("h1");
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    // otherwise take first non-empty paragraph/text node
    const text = tmp.textContent.replace(/\s+/g, " ").trim();
    if (!text) return null;
    return text.slice(0, 80);
}

async function checkAuthAndRole() {
    const { data } = await supabase.auth.getSession();
    const session = data?.session ?? null;
    const user = session?.user ?? null;
    if (!user) {
        // not logged in
        window.location.href = "/";
        return false;
    }
    currentUser = user;

    // read roles
    const { data: rolesData, error: rolesErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.id);

    if (rolesErr) {
        console.error("Failed to fetch user_roles", rolesErr);
        msgEl.textContent = "Error checking permissions";
        return false;
    }

    if (!rolesData || rolesData.length === 0) {
        msgEl.textContent = "Access denied: no Writer or Admin role found";
        setTimeout(() => (window.location.href = "/"), 1200);
        return false;
    }

    if (rolesData.some(r => r.role === "Admin")) userRole = "Admin";
    else if (rolesData.some(r => r.role === "Writer")) userRole = "Writer";
    else {
        msgEl.textContent = "Access denied: no Writer or Admin role found";
        setTimeout(() => (window.location.href = "/"), 1200);
        return false;
    }

    return true;
}

async function loadMyDrafts() {
    myDraftsEl.innerHTML = "<div class='item' style='opacity:.8'>Loading…</div>";
    try {
        const { data, error } = await supabase
            .from("articles_in_progress")
            .select("id, html, updated_at, user_id, title_image")
            .eq("user_id", currentUser.id)
            .order("updated_at", { ascending: false })
            .limit(200);

        if (error) throw error;
        myDraftsEl.innerHTML = "";
        if (!data || data.length === 0) {
            myDraftsEl.innerHTML = "<div class='item' style='opacity:.7'>No drafts — click Create New</div>";
            return;
        }
        data.forEach(d => {
            const title = extractTitleFromHtml(d.html) || "(Untitled)";
            const date = new Date(d.updated_at || Date.now()).toLocaleString();
            const item = document.createElement("div");
            item.className = "item";
            item.innerHTML = `
                <div class="content">
                    <div class="info">
                        <div class="title">${escapeHtml(title)}</div>
                        <div class="meta">
                            ${escapeHtml(date)}
                        </div>
                    </div>
                    <button class="remove-btn" title="Delete draft">Delete</button>
                </div>
            `;
            
            // Add click handler for the main item area
            item.addEventListener("click", (e) => {
                // Don't trigger if clicking the delete button
                if (!e.target.closest('.remove-btn')) {
                    localStorage.setItem("editingArticleId", d.id);
                    window.location.href = "/create-article/";
                }
            });
            
            // Add click handler for remove button
            const removeBtn = item.querySelector('.remove-btn');
            removeBtn.addEventListener("click", async (e) => {
                e.stopPropagation(); // Prevent opening the draft
                if (confirm('Are you sure you want to delete this draft?')) {
                    try {
                        deleteArticleImages(d.html, "Images", d.title_image);

                        const { error } = await supabase
                            .from("articles_in_progress")
                            .delete()
                            .eq('id', d.id);
                        
                        if (error) throw error;
                        
                        // Remove the item from the UI
                        item.style.animation = 'fadeOut 0.3s ease';
                        setTimeout(() => item.remove(), 300);
                    } catch (err) {
                        console.error('Failed to delete draft:', err);
                        alert('Failed to delete draft. Please try again.');
                    }
                }
            });
            
            myDraftsEl.appendChild(item);
        });
    } catch (e) {
        console.error(e);
        myDraftsEl.innerHTML = "<div class='item'>Error loading drafts</div>";
    }
}

async function loadOtherDrafts() {
    otherDraftsEl.innerHTML = "<div class='item' style='opacity:.8'>Loading…</div>";
    try {
        const { data, error } = await supabase
            .from("articles_in_progress")
            .select("id, html, updated_at, user_id")
            .neq("user_id", currentUser.id)
            .order("updated_at", { ascending: false })
            .limit(200);

        const { data: user } = await supabase
            .from("profiles")
            .select("id, display_name")
        const profileMap = Object.fromEntries(user.map(u => [u.id, u.display_name]));

        if (error) throw error;
        otherDraftsEl.innerHTML = "";
        if (!data || data.length === 0) {
            otherDraftsEl.innerHTML = "<div class='item' style='opacity:.7'>No other drafts</div>";
            return;
        }
        data.forEach(d => {
            const title = extractTitleFromHtml(d.html) || "(Untitled)";
            const date = new Date(d.updated_at || Date.now()).toLocaleString();
            const item = document.createElement("div");
            item.className = "item";
            item.innerHTML = `
                <div class="content">
                    <div class="info">
                        <div class="title">${escapeHtml(title)}</div>
                        <div class="meta">
                            ${escapeHtml(date)} • ${escapeHtml(profileMap[d.user_id])}
                        </div>
                    </div>
                    <button class="remove-btn" title="Delete draft">Delete</button>
                </div>
            `;
            
            // Add click handler for the main item area
            item.addEventListener("click", (e) => {
                // Don't trigger if clicking the delete button
                if (!e.target.closest('.remove-btn')) {
                    localStorage.setItem("editingArticleId", d.id);
                    window.location.href = "/create-article/";
                }
            });
            
            // Add click handler for remove button
            const removeBtn = item.querySelector('.remove-btn');
            removeBtn.addEventListener("click", async (e) => {
                e.stopPropagation(); // Prevent opening the draft
                
                if (confirm('Are you sure you want to delete this draft?')) {
                    try {
                        const { error } = await supabase
                            .from("articles_in_progress")
                            .delete()
                            .eq('id', d.id);
                        
                        if (error) throw error;
                        
                        // Remove the item from the UI
                        item.style.animation = 'fadeOut 0.3s ease';
                        setTimeout(() => item.remove(), 300);
                    } catch (err) {
                        console.error('Failed to delete draft:', err);
                        alert('Failed to delete draft. Please try again.');
                    }
                }
            });
            
            otherDraftsEl.appendChild(item);
        });
    } catch (e) {
        console.error(e);
        otherDraftsEl.innerHTML = "<div class='item'>Error loading other drafts</div>";
    }
}

async function createNewDraftAndOpen() {
    msgEl.textContent = "Creating new draft…";
    try {
        const payload = {
            user_id: currentUser.id,
            html: "<h1>Untitled</h1><p></p>",
            updated_at: new Date().toISOString()
        };
        const { data, error } = await supabase
            .from("articles_in_progress")
            .insert([payload])
            .select("id")
            .single();

        if (error) throw error;
        localStorage.setItem("editingArticleId", data.id);
        window.location.href = "/create-article/";
    } catch (e) {
        console.error(e);
        msgEl.textContent = "Failed to create new draft";
    }
}

newBtn.addEventListener("click", async () => {
    await createNewDraftAndOpen();
});

refreshBtn.addEventListener("click", () => {
    loadMyDrafts();
    if (userRole === "Admin") loadOtherDrafts();
});

(async function init() {
    msgEl.textContent = "";
    const ok = await checkAuthAndRole();
    if (!ok) return;
    await loadMyDrafts();
    if (userRole === "Admin") {
        otherBlock.style.display = "";
        await loadOtherDrafts();
    } else {
        otherBlock.style.display = "none";
    }
})();

async function deleteArticleImages(html, bucket = 'Images', title_image = null) {
  if (!html) return

  // Create a temporary div to parse HTML
  const temp = document.createElement('div')
  temp.innerHTML = html

  // Get all <img> elements
  const imgElements = Array.from(temp.querySelectorAll('img'))

  if (imgElements.length === 0) return
  console.log(imgElements);

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

  // Delete files from Supabase Storage
  const { data, error } = await supabase.storage.from(bucket).remove(pathsToDelete)

  if (error) {
    console.error('Error deleting images from storage:', error)
  } else {
    console.log('Deleted images:', pathsToDelete)
  }
}