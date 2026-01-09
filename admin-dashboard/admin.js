// Initialize Supabase
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const SUPABASE_URL = 'https://roqlhnyveyzjriawughf.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJvcWxobnl2ZXl6anJpYXd1Z2hmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3ODUwNTQsImV4cCI6MjA3NTM2MTA1NH0.VPie8b5quLIeSc_uEUheJhMXaupJWgxzo3_ib3egMJk'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const emailInput = document.getElementById("emailInput");
const roleSelect = document.getElementById("roleSelect");
const addUserBtn = document.getElementById("addUserBtn");
const adminList = document.getElementById("adminList");
const writerList = document.getElementById("writerList");

// Check if the current user is an admin
async function checkAdminAccess() {
  const { data: user } = await supabase.auth.getSession();
  if (!user.session?.user) {
    console.log("true");
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: "/"
        }
    })
    if (error) console.error('Login error:', error)
    return;
  }
  const { data, error: queryError } = await supabase.from("user_roles").select("*").eq("user_id",user.session.user.id).single();
  console.log(data);
  if (queryError || !data || data.role !== "Admin") {
    alert("Access denied. Admins only.");
    window.location.href = "/";
  } else {
    fetchUsers();
  }
}

async function fetchUsers() {
  const { data, error } = await supabase.from("user_roles").select("*");
  if (error) {
    console.error(error);
    alert("Error loading users.");
    return;
  }

  adminList.innerHTML = "";
  writerList.innerHTML = "";

  data.forEach((user) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${user.email}</span>`;

    if (user.role === "Writer") {
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.className = "remove-btn";
      removeBtn.onclick = () => removeWriter(user.id);
      li.appendChild(removeBtn);
      writerList.appendChild(li);
    } else if (user.role === "Admin") {
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.className = "remove-btn";
      removeBtn.onclick = () => removeAdmin(user.id);
      li.appendChild(removeBtn);
      adminList.appendChild(li);
    }
  });
}

// Add user
async function addUser() {
  const email = emailInput.value.trim();
  const role = roleSelect.value;
  if (!email) {
    alert("Please enter an email.");
    return;
  }

  console.log(email, role);
  const { error } = await supabase.from("user_roles").insert([{ role, email }]);
  if (error) {
    alert("Error: " + error.message);
  } else {
    alert(`${role} added successfully!`);
    emailInput.value = "";
    fetchUsers();
  }
}

// Remove writer
async function removeWriter(id) {
  if (!confirm("Are you sure you want to remove this writer?")) return;
  const { error } = await supabase.from("user_roles").delete().eq("id", id);
  if (error) {
    alert("Error removing writer.");
  } else {
    alert("Writer removed.");
    fetchUsers();
  }
}

async function removeAdmin(id) {
  if (!confirm("Are you sure you want to remove this admin?")) return;
  const { error } = await supabase.from("user_roles").delete().eq("id", id);
  if (error) {
    alert("Error removing admin.");
  } else {
    alert("Admin removed.");
    fetchUsers();
  }
}

addUserBtn.addEventListener("click", addUser);
checkAdminAccess();