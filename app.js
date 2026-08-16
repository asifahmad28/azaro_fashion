import {
    auth as firebaseAuth,
    db as firebaseDb
} from "./firebase-config.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged as firebaseOnAuthStateChanged,
    updatePassword
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

import {
    collection,
    addDoc,
    getDocs,
    getDoc,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

/* =========================================================
   AZARO — Firebase edition
   Static / GitHub Pages compatible
   ========================================================= */

/* ---------------------------------------------------------
   Firebase compatibility layer
   This lets the existing AZARO code use:
   db.collection(...).doc(...).get()
   auth.signInWithEmailAndPassword(...)
   etc.
   while actually using Firebase v12 modular SDK.
   --------------------------------------------------------- */

const auth = {
    get currentUser() {
        return firebaseAuth.currentUser;
    },

    createUserWithEmailAndPassword(email, password) {
        return createUserWithEmailAndPassword(firebaseAuth, email, password);
    },

    signInWithEmailAndPassword(email, password) {
        return signInWithEmailAndPassword(firebaseAuth, email, password);
    },

    signOut() {
        return firebaseSignOut(firebaseAuth);
    },

    onAuthStateChanged(callback) {
        return firebaseOnAuthStateChanged(firebaseAuth, callback);
    }
};

function makeQuery(ref, constraints = []) {
    return constraints.length ? query(ref, ...constraints) : ref;
}

function wrapQuery(ref) {
    const constraints = [];

    const wrapper = {
        where(field, operator, value) {
            return wrapQuery(
                makeQuery(ref, [...constraints, where(field, operator, value)])
            );
        },

        orderBy(field, direction = "asc") {
            return wrapQuery(
                makeQuery(ref, [...constraints, orderBy(field, direction)])
            );
        },

        limit(n) {
            return wrapQuery(
                makeQuery(ref, [...constraints, limit(n)])
            );
        },

        async get() {
            const finalRef = makeQuery(ref, constraints);
            return getDocs(finalRef);
        }
    };

    return wrapper;
}

function wrapDoc(docRef) {
    return {
        id: docRef.id,

        async get() {
            return getDoc(docRef);
        },

        async set(data, options) {
            return setDoc(docRef, data, options || {});
        },

        async update(data) {
            return updateDoc(docRef, data);
        },

        async delete() {
            return deleteDoc(docRef);
        }
    };
}

const db = {
    collection(name) {
        const ref = collection(firebaseDb, name);

        return {
            doc(id) {
                return wrapDoc(
                    id
                        ? doc(firebaseDb, name, id)
                        : doc(collection(firebaseDb, name))
                );
            },

            async add(data) {
                const result = await addDoc(ref, data);
                return {
                    id: result.id
                };
            },

            where(field, operator, value) {
                return wrapQuery(
                    makeQuery(ref, [where(field, operator, value)])
                );
            },

            orderBy(field, direction = "asc") {
                return wrapQuery(
                    makeQuery(ref, [orderBy(field, direction)])
                );
            },

            limit(n) {
                return wrapQuery(
                    makeQuery(ref, [limit(n)])
                );
            },

            async get() {
                return getDocs(ref);
            }
        };
    }
};

const firebaseReady = !!firebaseAuth && !!firebaseDb;

const TS = serverTimestamp();

const state = {
    user: null,
    profile: null,
    route: "home",
    data: {
        categories: [],
        products: [],
        orders: [],
        reviews: []
    },
    loading: false
};

/* =========================================================
   HELPERS
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = s =>
    String(s ?? "").replace(
        /[&<>'"]/g,
        m => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;"
        }[m])
    );

const money = n =>
    "৳" +
    Number(n || 0).toLocaleString("en-BD", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

const discount = (p, c) =>
    c && Number(c) > Number(p)
        ? Math.round((1 - Number(p) / Number(c)) * 100)
        : 0;

const initial = n =>
    (String(n || "U").trim()[0] || "U").toUpperCase();

const pathImage = p =>
    p
        ? String(p).startsWith("http")
            ? p
            : p
        : "assets/product-placeholder.svg";

const nav = route => {
    location.hash = "#/" + route;
};

const toast = (msg, type = "success") => {
    const root = $("#toast-root");

    if (!root) {
        alert(msg);
        return;
    }

    const d = document.createElement("div");
    d.className = "toast " + (type === "error" ? "error" : "");
    d.textContent = msg;

    root.appendChild(d);

    setTimeout(() => d.remove(), 3200);
};

const isStaff = () =>
    state.profile &&
    ["admin", "moderator"].includes(state.profile.role);

const isAdmin = () =>
    state.profile?.role === "admin";

const isBuyer = () =>
    state.profile?.role === "buyer";

const requireAuth = () => {
    if (!state.user) {
        nav("login");
        toast("Please login to continue.", "error");
        return false;
    }

    return true;
};

const requireStaff = () => {
    if (!isStaff()) {
        nav("home");
        toast("Staff access required.", "error");
        return false;
    }

    return true;
};

/* =========================================================
   ICONS / PROFILE
   ========================================================= */

function icon(name, size = 18) {
    return `<i data-lucide="${name}" width="${size}" height="${size}"></i>`;
}

function renderIcons() {
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function avatarHTML(p, size = "avatar") {
    return `
        <div class="${size}">
            ${
                p?.photo
                    ? `<img src="${esc(p.photo)}" alt="Profile">`
                    : esc(initial(p?.name))
            }
        </div>
    `;
}

/* =========================================================
   FIRESTORE HELPERS
   ========================================================= */

async function getProfile(uid) {
    const s = await db.collection("users").doc(uid).get();
    return s.exists ? s.data() : null;
}

async function getCategories() {
    const s = await db.collection("categories")
        .orderBy("title")
        .get();

    return s.docs.map(d => ({
        id: d.id,
        ...d.data()
    }));
}

async function getProducts(includeAll = false) {
    let q = db.collection("products");

    if (!includeAll) {
        q = q.where("status", "==", "active");
    }

    const s = await q.get();

    return s.docs
        .map(d => ({
            id: d.id,
            ...d.data()
        }))
        .sort(
            (a, b) =>
                (b.createdAt?.seconds || 0) -
                (a.createdAt?.seconds || 0)
        );
}

async function getOrdersForUser(uid) {
    const s = await db.collection("orders")
        .where("userId", "==", uid)
        .get();

    return s.docs
        .map(d => ({
            id: d.id,
            ...d.data()
        }))
        .sort(
            (a, b) =>
                (b.createdAt?.seconds || 0) -
                (a.createdAt?.seconds || 0)
        );
}

async function getAllOrders() {
    const s = await db.collection("orders").get();

    return s.docs
        .map(d => ({
            id: d.id,
            ...d.data()
        }))
        .sort(
            (a, b) =>
                (b.createdAt?.seconds || 0) -
                (a.createdAt?.seconds || 0)
        );
}

function dateVal(v) {
    if (!v) return "";

    if (v.toDate) {
        return v.toDate().toLocaleString();
    }

    return new Date(v).toLocaleString();
}

/* =========================================================
   HEADER / FOOTER
   ========================================================= */

function header() {
    return `
        <div class="announcement">
            AZARO — Own Your Style
            <span>•</span>
            New season essentials are here
        </div>

        <header class="topbar">
            <div class="container nav">

                <a class="brand" href="#/">
                    <img
                        src="assets/azaro-logo.jpg"
                        alt="AZARO"
                        class="logo"
                    >

                    <span>
                        <strong>AZARO</strong>
                        <small>Own Your Style</small>
                    </span>
                </a>

                <form class="search" id="globalSearch">
                    <span>⌕</span>
                    <input
                        name="q"
                        placeholder="Search shirts, pants, trousers, combos..."
                    >
                    <button>Search</button>
                </form>

                <nav class="links">
                    <a href="#/shop">Shop</a>

                    ${
                        state.user
                            ? (
                                isStaff()
                                    ? `<a href="#/admin/dashboard">Dashboard</a>`
                                    : `<a href="#/orders">Orders</a>`
                            )
                            : ""
                    }

                    ${
                        state.user
                            ? `
                                <a
                                    class="header-profile-link"
                                    href="#/profile"
                                >
                                    ${avatarHTML(
                                        state.profile,
                                        "header-avatar"
                                    )}
                                    <span class="desktop-only">
                                        Profile
                                    </span>
                                </a>

                                <a href="#" id="logoutLink">
                                    Logout
                                </a>
                            `
                            : `
                                <a href="#/login">Login</a>
                                <a
                                    class="nav-cta"
                                    href="#/register"
                                >
                                    Join AZARO
                                </a>
                            `
                    }

                    <a class="cart" href="#/cart">
                        Bag
                        <span id="cartCount">
                            ${cartCount()}
                        </span>
                    </a>
                </nav>

            </div>
        </header>
    `;
}

function footer() {
    return `
        <footer class="footer">
            <div class="container footer-grid">

                <div class="footer-brand">
                    <img
                        src="assets/azaro-logo.jpg"
                        alt="AZARO"
                    >

                    <div>
                        <h3>AZARO</h3>
                        <p>Own Your Style</p>
                    </div>

                    <p class="footer-copy">
                        Modern essentials designed for a confident
                        everyday wardrobe.
                    </p>
                </div>

                <div>
                    <h4>Shop</h4>
                    <a href="#/shop">All Products</a>

                    ${state.data.categories
                        .slice(0, 4)
                        .map(
                            c => `
                                <a href="#/shop?category=${encodeURIComponent(
                                    c.id
                                )}">
                                    ${esc(c.title)}
                                </a>
                            `
                        )
                        .join("")}
                </div>

                <div>
                    <h4>Account</h4>
                    <a href="#/login">Login</a>
                    <a href="#/register">Create Account</a>
                    <a href="#/profile">My Profile</a>
                    <a href="#/orders">Order History</a>
                </div>

                <div>
                    <h4>AZARO</h4>
                    <p>Own Your Style.</p>
                    <p class="muted-light">
                        Curated fashion, clean silhouettes and
                        easy everyday shopping.
                    </p>
                </div>

            </div>

            <div class="copyright">
                © ${new Date().getFullYear()} AZARO.
                Own Your Style. All rights reserved.
            </div>
        </footer>
    `;
}

function shell(content, admin = false) {
    return `
        ${header()}
        ${
            admin
                ? content
                : `<main class="view">${content}</main>`
        }
        ${admin ? "" : footer()}
    `;
}

/* =========================================================
   PRODUCT CARD
   ========================================================= */

function productCard(p) {
    const d = discount(p.price, p.comparePrice);

    return `
        <article class="card product-card">

            <a
                class="product-media"
                href="#/product/${p.id}"
            >
                ${
                    d
                        ? `<span class="discount-badge">-${d}%</span>`
                        : ""
                }

                <img
                    class="product-img"
                    src="${esc(pathImage(p.image))}"
                    alt="${esc(p.name)}"
                >
            </a>

            <div class="card-body">

                <span class="badge">
                    ${esc(p.category || "AZARO")}
                </span>

                <h3>${esc(p.name)}</h3>

                <div class="price-row">
                    <strong class="price">
                        ${money(p.price)}
                    </strong>

                    ${
                        d
                            ? `<del>${money(
                                  p.comparePrice
                              )}</del>`
                            : ""
                    }
                </div>

                ${
                    d
                        ? `
                            <span class="save-line">
                                Save ${money(
                                    Number(p.comparePrice) -
                                    Number(p.price)
                                )}
                            </span>
                        `
                        : ""
                }

                <div class="card-actions">

                    <a
                        class="btn btn-light"
                        href="#/product/${p.id}"
                    >
                        View Details
                    </a>

                    <button
                        class="btn btn-primary add-btn"
                        data-id="${p.id}"
                        ${Number(p.stock) <= 0 ? "disabled" : ""}
                    >
                        ${
                            Number(p.stock) > 0
                                ? "Add to Cart"
                                : "Out of Stock"
                        }
                    </button>

                </div>
            </div>
        </article>
    `;
}

/* =========================================================
   HOME
   ========================================================= */

async function home() {
    const cats = state.data.categories;
    const products = state.data.products;

    const offer = products.find(
        p => discount(p.price, p.comparePrice)
    );

    return `
        <section class="hero fashion-hero">
            <div class="container hero-grid">

                <div class="hero-copy">

                    <span class="eyebrow">
                        AZARO • NEW SEASON
                    </span>

                    <h1>
                        Dress well.<br>
                        <em>Own your style.</em>
                    </h1>

                    <p>
                        Timeless everyday pieces, refined fits
                        and effortless combinations — curated
                        for the way you live.
                    </p>

                    <div class="hero-actions">
                        <a
                            class="btn btn-primary"
                            href="#/shop"
                        >
                            Shop the collection
                        </a>

                        <a
                            class="btn btn-outline"
                            href="#/shop?category=${cats[0]?.id || ""}"
                        >
                            Explore ${esc(
                                cats[0]?.title || "the edit"
                            )}
                        </a>
                    </div>

                    <div class="hero-note">
                        <span>✦</span>
                        Designed for everyday confidence
                    </div>

                </div>

                <div class="hero-visual">

                    <div class="hero-logo-card">
                        <img
                            src="assets/azaro-logo.jpg"
                            alt="AZARO logo"
                        >
                        <b>Own Your Style</b>
                    </div>

                    <div class="hero-vertical">
                        AZARO / 2026 COLLECTION
                    </div>

                </div>

            </div>
        </section>

        <section class="section category-section">
            <div class="container">

                <div class="section-head">
                    <div>
                        <span class="eyebrow">THE EDIT</span>
                        <h2>Shop by category</h2>
                    </div>

                    <a href="#/shop" class="text-link">
                        View all →
                    </a>
                </div>

                <div class="category-grid">
                    ${cats
                        .map(
                            (c, i) => `
                                <a
                                    class="category-tile"
                                    href="#/shop?category=${encodeURIComponent(
                                        c.id
                                    )}"
                                >
                                    <span class="category-no">
                                        ${String(i + 1).padStart(
                                            2,
                                            "0"
                                        )}
                                    </span>

                                    <div>
                                        <h3>${esc(c.title)}</h3>
                                        <p>Explore collection</p>
                                    </div>

                                    <span class="arrow">↗</span>
                                </a>
                            `
                        )
                        .join("")}
                </div>

            </div>
        </section>

        <section class="section featured-section">
            <div class="container">

                <div class="section-head">
                    <div>
                        <span class="eyebrow">
                            CURATED FOR YOU
                        </span>
                        <h2>Latest arrivals</h2>
                    </div>

                    <a
                        href="#/shop"
                        class="text-link"
                    >
                        See all pieces →
                    </a>
                </div>

                <div class="grid">
                    ${products
                        .slice(0, 8)
                        .map(productCard)
                        .join("")}
                </div>

            </div>
        </section>

        <section class="editorial">
            <div class="container editorial-grid">

                <div>
                    <span class="eyebrow">
                        THE AZARO STANDARD
                    </span>

                    <h2>
                        Simple pieces.<br>
                        <em>Strong presence.</em>
                    </h2>

                    <p>
                        We keep the collection focused:
                        shirts, pants, trousers and thoughtfully
                        paired combos that make getting dressed
                        easier.
                    </p>

                    <a
                        class="text-link light-link"
                        href="#/shop"
                    >
                        Discover AZARO →
                    </a>
                </div>

                <div class="editorial-stat">
                    <strong>01</strong>
                    <span>Clean cuts</span>

                    <strong>02</strong>
                    <span>Everyday comfort</span>

                    <strong>03</strong>
                    <span>Easy styling</span>
                </div>

            </div>
        </section>

        <section class="trust-section">
            <div class="container trust-grid">

                <div>
                    <b>✓</b>
                    <span>
                        <strong>Curated quality</strong>
                        <small>
                            Pieces selected for everyday wear
                        </small>
                    </span>
                </div>

                <div>
                    <b>✓</b>
                    <span>
                        <strong>Clear pricing</strong>
                        <small>
                            Offers shown before checkout
                        </small>
                    </span>
                </div>

                <div>
                    <b>✓</b>
                    <span>
                        <strong>Easy ordering</strong>
                        <small>
                            Simple shopping from start to finish
                        </small>
                    </span>
                </div>

                <div>
                    <b>✓</b>
                    <span>
                        <strong>Order history</strong>
                        <small>
                            Track every purchase from your profile
                        </small>
                    </span>
                </div>

            </div>
        </section>

        ${
            offer
                ? `
                    <div
                        class="offer-backdrop"
                        id="offerPopup"
                    >
                        <div class="offer-modal">

                            <button
                                class="offer-close"
                                id="offerClose"
                            >
                                ×
                            </button>

                            <div class="offer-image">
                                <img
                                    src="${esc(
                                        pathImage(offer.image)
                                    )}"
                                    alt="${esc(offer.name)}"
                                >
                            </div>

                            <div class="offer-copy">

                                <span class="eyebrow">
                                    LIMITED-TIME OFFER
                                </span>

                                <h2>
                                    Made for your next look.
                                </h2>

                                <p>
                                    ${esc(offer.name)}
                                </p>

                                <div class="offer-price">
                                    <strong>
                                        ${money(offer.price)}
                                    </strong>

                                    <del>
                                        ${money(
                                            offer.comparePrice
                                        )}
                                    </del>

                                    <span>
                                        -${discount(
                                            offer.price,
                                            offer.comparePrice
                                        )}%
                                    </span>
                                </div>

                                <a
                                    class="btn btn-primary"
                                    href="#/product/${offer.id}"
                                >
                                    View offer
                                </a>

                            </div>
                        </div>
                    </div>
                `
                : ""
        }
    `;
}

/* =========================================================
   SHOP
   ========================================================= */

async function shop() {
    const params = new URLSearchParams(
        location.hash.split("?")[1] || ""
    );

    const q = (params.get("q") || "").toLowerCase();
    const cat = params.get("category") || "";
    const sort = params.get("sort") || "";

    let products = state.data.products.filter(
        p =>
            (!cat ||
                p.categoryId === cat ||
                p.category === cat) &&
            (!q ||
                `${p.name} ${p.content || ""}`
                    .toLowerCase()
                    .includes(q))
    );

    if (sort === "price_low") {
        products.sort((a, b) => a.price - b.price);
    }

    if (sort === "price_high") {
        products.sort((a, b) => b.price - a.price);
    }

    return `
        <section class="app-page">
            <div class="app-container">

                <div class="shop-hero">
                    <div>
                        <span class="eyebrow">AZARO</span>

                        <h1>
                            Wear it well.
                            Own your style.
                        </h1>

                        <p>
                            Explore shirts, pants, trousers
                            and curated combos from the official
                            AZARO fashion store.
                        </p>
                    </div>

                    <div class="shop-hero-stat">
                        <b>${products.length}</b>
                        <span>Products available</span>
                    </div>
                </div>

                <div class="store-toolbar">

                    <div>
                        <span class="eyebrow">BROWSE</span>
                        <h2>All Products</h2>
                    </div>

                    <form
                        class="filter-row"
                        id="shopFilter"
                    >
                        <input
                            name="q"
                            value="${esc(q)}"
                            placeholder="Search products..."
                        >

                        <select name="category">
                            <option value="">
                                All categories
                            </option>

                            ${state.data.categories
                                .map(
                                    c => `
                                        <option
                                            value="${c.id}"
                                            ${
                                                cat === c.id
                                                    ? "selected"
                                                    : ""
                                            }
                                        >
                                            ${esc(c.title)}
                                        </option>
                                    `
                                )
                                .join("")}
                        </select>

                        <select name="sort">
                            <option value="">
                                Latest
                            </option>

                            <option
                                value="price_low"
                                ${
                                    sort === "price_low"
                                        ? "selected"
                                        : ""
                                }
                            >
                                Price: Low to High
                            </option>

                            <option
                                value="price_high"
                                ${
                                    sort === "price_high"
                                        ? "selected"
                                        : ""
                                }
                            >
                                Price: High to Low
                            </option>
                        </select>

                        <button class="btn btn-primary">
                            Filter
                        </button>
                    </form>
                </div>

                <div class="grid">
                    ${products.map(productCard).join("")}
                </div>

                ${
                    !products.length
                        ? `
                            <div class="panel empty-state">
                                <h2>No products found</h2>
                                <p class="muted">
                                    Try another search or category.
                                </p>
                            </div>
                        `
                        : ""
                }

            </div>
        </section>
    `;
}

/* =========================================================
   PRODUCT PAGE
   ========================================================= */

async function productPage(id) {
    let p = state.data.products.find(x => x.id === id);

    if (!p) {
        const snap = await db
            .collection("products")
            .doc(id)
            .get();

        if (snap.exists) {
            p = {
                id: snap.id,
                ...snap.data()
            };
        }
    }

    if (!p) {
        return `
            <section class="app-page">
                <div class="app-container">
                    <div class="panel">
                        <h1>Product not found</h1>
                    </div>
                </div>
            </section>
        `;
    }

    const d = discount(p.price, p.comparePrice);

    const rs = await db
        .collection("reviews")
        .where("productId", "==", id)
        .get();

    const reviews = rs.docs
        .map(x => ({
            id: x.id,
            ...x.data()
        }))
        .sort(
            (a, b) =>
                (b.createdAt?.seconds || 0) -
                (a.createdAt?.seconds || 0)
        );

    const avg = reviews.length
        ? (
              reviews.reduce(
                  (a, r) => a + Number(r.rating),
                  0
              ) / reviews.length
          ).toFixed(1)
        : "0.0";

    return `
        <section class="app-page">
            <div class="app-container">

                <div class="breadcrumbs">
                    <a href="#/shop">Shop</a>
                    <span>›</span>
                    <span>
                        ${esc(p.category || "Collection")}
                    </span>
                    <span>›</span>
                    <b>${esc(p.name)}</b>
                </div>

                <div class="detail-layout">

                    <div class="detail-image-wrap">

                        ${
                            d
                                ? `
                                    <span
                                        class="discount-badge"
                                        style="font-size:14px"
                                    >
                                        -${d}% OFF
                                    </span>
                                `
                                : ""
                        }

                        <img
                            class="detail-img"
                            src="${esc(pathImage(p.image))}"
                            alt="${esc(p.name)}"
                        >
                    </div>

                    <div class="detail-copy">

                        <span class="badge">
                            ${esc(p.category || "AZARO")}
                        </span>

                        <h1>${esc(p.name)}</h1>

                        <div class="rating-line">
                            <span class="stars">
                                ${"★".repeat(
                                    Math.round(avg)
                                )}
                                ${"☆".repeat(
                                    5 - Math.round(avg)
                                )}
                            </span>

                            <span>
                                ${avg} · ${reviews.length} reviews
                            </span>
                        </div>

                        <div class="detail-price">
                            <strong>
                                ${money(p.price)}
                            </strong>

                            ${
                                d
                                    ? `
                                        <del>
                                            ${money(
                                                p.comparePrice
                                            )}
                                        </del>

                                        <span
                                            class="status-pill status-delivered"
                                        >
                                            ${d}% OFF
                                        </span>
                                    `
                                    : ""
                            }
                        </div>

                        ${
                            d
                                ? `
                                    <div class="offer-box">
                                        <b>Special offer</b>
                                        <span>
                                            You save
                                            ${money(
                                                Number(
                                                    p.comparePrice
                                                ) -
                                                    Number(
                                                        p.price
                                                    )
                                            )}
                                            on this product.
                                        </span>
                                    </div>
                                `
                                : ""
                        }

                        <div class="detail-stock">
                            <span class="stock-dot"></span>

                            ${
                                Number(p.stock) > 0
                                    ? "In stock"
                                    : "Out of stock"
                            }

                            <span>•</span>

                            ${
                                Number(p.stock) > 0
                                    ? `${p.stock} units available`
                                    : "Currently unavailable"
                            }
                        </div>

                        <p class="detail-description">
                            ${esc(
                                p.content ||
                                    "A refined AZARO essential designed for everyday style."
                            )}
                        </p>

                        <div class="feature-strip">
                            <div>
                                <b>✓</b>
                                <span>Authentic product</span>
                            </div>

                            <div>
                                <b>✓</b>
                                <span>Home delivery</span>
                            </div>

                            <div>
                                <b>✓</b>
                                <span>Easy ordering</span>
                            </div>
                        </div>

                        <div class="buy-row">

                            <input
                                class="qty-input"
                                id="detailQty"
                                type="number"
                                min="1"
                                max="${Math.max(
                                    1,
                                    Number(p.stock)
                                )}"
                                value="1"
                            >

                            <button
                                class="btn btn-primary"
                                id="detailAdd"
                                data-id="${p.id}"
                                ${
                                    Number(p.stock) <= 0
                                        ? "disabled"
                                        : ""
                                }
                            >
                                Add to Cart
                            </button>

                        </div>

                        <div
                            class="panel"
                            style="padding:18px"
                        >
                            <b>Delivery</b>
                            <p class="muted">
                                Home delivery • Order tracking
                                available from your profile.
                            </p>
                        </div>

                    </div>
                </div>

                <section class="section">

                    <div class="section-head">
                        <div>
                            <span class="eyebrow">
                                CUSTOMER VOICE
                            </span>

                            <h2>Reviews</h2>
                        </div>
                    </div>

                    <div class="review-list">

                        ${
                            reviews
                                .map(
                                    r => `
                                        <article class="review-item">

                                            <div class="review-head">
                                                <div>
                                                    <b>
                                                        ${esc(
                                                            r.userName ||
                                                                "AZARO Customer"
                                                        )}
                                                    </b>

                                                    <div class="stars">
                                                        ${"★".repeat(
                                                            Number(
                                                                r.rating
                                                            )
                                                        )}
                                                        ${"☆".repeat(
                                                            5 -
                                                                Number(
                                                                    r.rating
                                                                )
                                                        )}
                                                    </div>
                                                </div>

                                                <small>
                                                    ${dateVal(
                                                        r.createdAt
                                                    )}
                                                </small>
                                            </div>

                                            <p>
                                                ${esc(
                                                    r.comment || ""
                                                )}
                                            </p>

                                        </article>
                                    `
                                )
                                .join("") ||
                            `
                                <p class="muted">
                                    No reviews yet. Be the first
                                    to share your experience.
                                </p>
                            `
                        }

                    </div>

                    ${
                        isBuyer()
                            ? `
                                <form
                                    class="review-form"
                                    id="reviewForm"
                                >
                                    <h3>Write a review</h3>

                                    <select name="rating">
                                        <option value="5">
                                            5 — Excellent
                                        </option>
                                        <option value="4">
                                            4 — Great
                                        </option>
                                        <option value="3">
                                            3 — Good
                                        </option>
                                        <option value="2">
                                            2 — Fair
                                        </option>
                                        <option value="1">
                                            1 — Poor
                                        </option>
                                    </select>

                                    <textarea
                                        name="comment"
                                        placeholder="Tell us about the fit, quality or feel..."
                                    ></textarea>

                                    <button class="btn btn-primary">
                                        Save Review
                                    </button>
                                </form>
                            `
                            : `
                                <p
                                    class="muted"
                                    style="margin-top:20px"
                                >
                                    Login as a buyer to leave a review.
                                </p>
                            `
                    }

                </section>

            </div>
        </section>
    `;
}

/* =========================================================
   CART
   ========================================================= */

function cart() {
    try {
        return JSON.parse(
            localStorage.getItem("azaro_cart") || "[]"
        );
    } catch {
        return [];
    }
}

function saveCart(c) {
    localStorage.setItem(
        "azaro_cart",
        JSON.stringify(c)
    );

    const el = $("#cartCount");

    if (el) {
        el.textContent = cartCount();
    }
}

function cartCount() {
    return cart().reduce(
        (a, x) => a + Number(x.qty || 0),
        0
    );
}

function addToCart(id, qty = 1) {
    const p = state.data.products.find(
        x => x.id === id
    );

    if (!p) return;

    if (Number(p.stock) <= 0) {
        toast("This product is out of stock.", "error");
        return;
    }

    const requested = Math.max(
        1,
        Number(qty) || 1
    );

    const c = cart();
    const row = c.find(x => x.id === id);

    if (row) {
        row.qty = Math.min(
            Number(p.stock),
            row.qty + requested
        );
    } else {
        c.push({
            id,
            qty: Math.min(
                Number(p.stock),
                requested
            )
        });
    }

    saveCart(c);
    toast("Added to your bag.");
}

function cartPage() {
    const c = cart();

    const items = c
        .map(x => ({
            ...x,
            p: state.data.products.find(
                p => p.id === x.id
            )
        }))
        .filter(
            x =>
                x.p &&
                x.qty > 0
        );

    const total = items.reduce(
        (a, x) =>
            a +
            x.qty *
                Number(x.p.price),
        0
    );

    return `
        <section class="app-page">
            <div class="app-container">

                <div class="section-head">

                    <div>
                        <span class="eyebrow">
                            YOUR BAG
                        </span>

                        <h1>Shopping Cart</h1>

                        <p class="muted">
                            ${cartCount()}
                            item(s) ready for checkout.
                        </p>
                    </div>

                    <a
                        class="btn btn-light"
                        href="#/shop"
                    >
                        Continue Shopping
                    </a>

                </div>

                ${
                    items.length
                        ? `
                            <div class="cart-layout">

                                <div class="cart-list">

                                    ${items
                                        .map(
                                            x => `
                                                <div class="cart-row">

                                                    <img
                                                        class="cart-thumb"
                                                        src="${esc(
                                                            pathImage(
                                                                x.p.image
                                                            )
                                                        )}"
                                                    >

                                                    <div>
                                                        <b>
                                                            ${esc(
                                                                x.p.name
                                                            )}
                                                        </b>

                                                        <div class="muted">
                                                            ${esc(
                                                                x.p.category ||
                                                                    "AZARO"
                                                            )}
                                                            ·
                                                            ${money(
                                                                x.p.price
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div class="qty-control">

                                                        <button
                                                            class="admin-btn cart-minus"
                                                            data-id="${x.id}"
                                                        >
                                                            −
                                                        </button>

                                                        <input
                                                            value="${x.qty}"
                                                            data-id="${x.id}"
                                                            class="cart-qty"
                                                        >

                                                        <button
                                                            class="admin-btn cart-plus"
                                                            data-id="${x.id}"
                                                        >
                                                            +
                                                        </button>

                                                    </div>

                                                    <div class="cart-line-total">

                                                        <b>
                                                            ${money(
                                                                x.qty *
                                                                    x.p
                                                                        .price
                                                            )}
                                                        </b>

                                                        <button
                                                            class="admin-btn danger cart-remove"
                                                            data-id="${x.id}"
                                                        >
                                                            ${icon(
                                                                "trash-2",
                                                                15
                                                            )}
                                                        </button>

                                                    </div>

                                                </div>
                                            `
                                        )
                                        .join("")}

                                </div>

                                <aside class="summary-card">

                                    <span class="eyebrow">
                                        ORDER SUMMARY
                                    </span>

                                    <h2>
                                        Ready when you are.
                                    </h2>

                                    <div class="summary-line">
                                        <span>Subtotal</span>
                                        <b>${money(total)}</b>
                                    </div>

                                    <div class="summary-line">
                                        <span>Delivery</span>
                                        <b>
                                            Calculated at checkout
                                        </b>
                                    </div>

                                    <div
                                        class="summary-line summary-total"
                                    >
                                        <span>Total</span>
                                        <b>${money(total)}</b>
                                    </div>

                                    <a
                                        class="btn btn-primary"
                                        style="width:100%;margin-top:15px"
                                        href="#/checkout"
                                    >
                                        Proceed to Checkout
                                    </a>

                                    <button
                                        class="btn btn-light"
                                        style="width:100%;margin-top:8px"
                                        id="clearCart"
                                    >
                                        Clear Bag
                                    </button>

                                </aside>

                            </div>
                        `
                        : `
                            <div class="panel empty-state">
                                <h2>Your bag is empty.</h2>

                                <p class="muted">
                                    Add something you like
                                    from the AZARO collection.
                                </p>

                                <a
                                    href="#/shop"
                                    class="btn btn-primary"
                                >
                                    Browse Products
                                </a>
                            </div>
                        `
                }

            </div>
        </section>
    `;
}

/* =========================================================
   CHECKOUT
   ========================================================= */

function checkoutPage() {
    if (!state.user) {
        return `
            <section class="auth-shell">
                <div class="auth-card">

                    <h1>Login to checkout</h1>

                    <p class="muted">
                        Your cart is saved in this browser.
                    </p>

                    <a
                        class="btn btn-primary"
                        href="#/login"
                    >
                        Login
                    </a>

                </div>
            </section>
        `;
    }

    const c = cart();

    const items = c
        .map(x => ({
            ...x,
            p: state.data.products.find(
                p => p.id === x.id
            )
        }))
        .filter(x => x.p);

    const total = items.reduce(
        (a, x) =>
            a +
            x.qty *
                Number(x.p.price),
        0
    );

    return `
        <section class="app-page">
            <div class="app-container">

                <div class="section-head">
                    <div>
                        <span class="eyebrow">
                            CHECKOUT
                        </span>

                        <h1>
                            Complete your order
                        </h1>
                    </div>
                </div>

                <form
                    id="checkoutForm"
                    class="checkout-layout"
                >

                    <div class="form-card">

                        <h2>Delivery details</h2>

                        <div class="form-grid-2">

                            <div class="field">
                                <label>Full name</label>

                                <input
                                    name="name"
                                    required
                                    value="${esc(
                                        state.profile?.name ||
                                            ""
                                    )}"
                                >
                            </div>

                            <div class="field">
                                <label>
                                    Mobile number
                                </label>

                                <input
                                    name="phone"
                                    required
                                    value="${esc(
                                        state.profile?.phone ||
                                            ""
                                    )}"
                                >
                            </div>

                        </div>

                        <div
                            class="field"
                            style="margin-top:14px"
                        >
                            <label>Email</label>

                            <input
                                value="${esc(
                                    state.profile?.email ||
                                        state.user.email
                                )}"
                                disabled
                            >
                        </div>

                        <div
                            class="field"
                            style="margin-top:14px"
                        >
                            <label>
                                Delivery address
                            </label>

                            <textarea
                                name="address"
                                required
                                placeholder="House/Road, Area, City..."
                            >${esc(
                                state.profile?.address ||
                                    ""
                            )}</textarea>
                        </div>

                        <div
                            class="field"
                            style="margin-top:14px"
                        >
                            <label>
                                Payment method
                            </label>

                            <select name="payment">
                                <option>
                                    Cash on Delivery
                                </option>
                            </select>
                        </div>

                        <button
                            class="btn btn-primary"
                            style="margin-top:18px"
                        >
                            Place Order
                        </button>

                    </div>

                    <aside class="summary-card">

                        <span class="eyebrow">
                            YOUR ORDER
                        </span>

                        ${items
                            .map(
                                x => `
                                    <div class="summary-line">
                                        <span>
                                            ${esc(
                                                x.p.name
                                            )}
                                            × ${x.qty}
                                        </span>

                                        <b>
                                            ${money(
                                                x.p.price *
                                                    x.qty
                                            )}
                                        </b>
                                    </div>
                                `
                            )
                            .join("")}

                        <div
                            class="summary-line summary-total"
                        >
                            <span>Total</span>
                            <b>${money(total)}</b>
                        </div>

                    </aside>

                </form>
            </div>
        </section>
    `;
}

/* =========================================================
   ORDERS
   ========================================================= */

function ordersPage() {
    if (!requireAuth()) return "";

    return `
        <section class="app-page">
            <div class="app-container">

                <div class="section-head">
                    <div>
                        <span class="eyebrow">
                            MY PURCHASES
                        </span>

                        <h1>Order History</h1>

                        <p class="muted">
                            Every purchase placed from
                            your AZARO account.
                        </p>
                    </div>
                </div>

                <div
                    id="buyerOrders"
                    class="order-history"
                ></div>

            </div>
        </section>
    `;
}

/* =========================================================
   PROFILE
   ========================================================= */

async function profilePage() {
    if (!requireAuth()) return "";

    const orders =
        await getOrdersForUser(
            state.user.uid
        );

    return `
        <section class="app-page">
            <div class="app-container">

                <div class="profile-hero">

                    ${avatarHTML(
                        state.profile,
                        "avatar"
                    )}

                    <div>
                        <span class="eyebrow">
                            MY ACCOUNT
                        </span>

                        <h1>
                            ${esc(
                                state.profile?.name ||
                                    "AZARO Customer"
                            )}
                        </h1>

                        <p>
                            ${esc(
                                state.profile?.email ||
                                    state.user.email
                            )}
                            ·
                            <b>
                                ${esc(
                                    state.profile?.role ||
                                        "buyer"
                                )}
                            </b>
                        </p>
                    </div>

                </div>

                <div class="profile-grid">

                    <section class="profile-card">

                        <span class="eyebrow">
                            PROFILE PHOTO
                        </span>

                        <h2>
                            Change profile picture
                        </h2>

                        <div
                            style="
                                display:flex;
                                gap:16px;
                                align-items:center;
                                margin:15px 0
                            "
                        >

                            ${avatarHTML(
                                state.profile,
                                "avatar"
                            )}

                            <div>
                                <input
                                    id="profilePhoto"
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                >

                                <p class="tiny">
                                    The image is resized
                                    in your browser before
                                    being stored in Firestore.
                                </p>
                            </div>

                        </div>

                        <button
                            class="btn btn-primary"
                            id="savePhoto"
                        >
                            Save Picture
                        </button>

                    </section>

                    <section class="profile-card">

                        <span class="eyebrow">
                            SECURITY
                        </span>

                        <h2>Change password</h2>

                        <form
                            id="passwordForm"
                            class="form-grid"
                        >

                            <div class="field">
                                <label>
                                    New password
                                </label>

                                <input
                                    name="password"
                                    type="password"
                                    minlength="6"
                                    required
                                >
                            </div>

                            <button
                                class="btn btn-dark"
                            >
                                Update Password
                            </button>

                        </form>

                    </section>

                </div>

                <section
                    class="profile-card"
                    style="margin-top:22px"
                >

                    <span class="eyebrow">
                        ACCOUNT DETAILS
                    </span>

                    <h2>
                        Personal information
                    </h2>

                    <form
                        id="profileForm"
                        class="form-grid-2"
                    >

                        <div class="field">
                            <label>Full name</label>

                            <input
                                name="name"
                                required
                                value="${esc(
                                    state.profile?.name ||
                                        ""
                                )}"
                            >
                        </div>

                        <div class="field">
                            <label>Email</label>

                            <input
                                disabled
                                value="${esc(
                                    state.profile?.email ||
                                        state.user.email
                                )}"
                            >
                        </div>

                        <div class="field">
                            <label>
                                Mobile number
                            </label>

                            <input
                                name="phone"
                                required
                                value="${esc(
                                    state.profile?.phone ||
                                        ""
                                )}"
                            >
                        </div>

                        <div class="field">
                            <label>
                                Delivery address
                            </label>

                            <input
                                name="address"
                                value="${esc(
                                    state.profile?.address ||
                                        ""
                                )}"
                            >
                        </div>

                        <button class="btn btn-primary">
                            Save Changes
                        </button>

                    </form>

                </section>

                ${
                    isBuyer()
                        ? `
                            <section
                                class="profile-card order-history"
                                id="order-history"
                            >

                                <div class="section-head">
                                    <div>
                                        <span class="eyebrow">
                                            PURCHASE HISTORY
                                        </span>

                                        <h2>
                                            My Order History
                                        </h2>
                                    </div>

                                    <a
                                        class="btn btn-light"
                                        href="#/orders"
                                    >
                                        Open Orders
                                    </a>
                                </div>

                                ${
                                    orders.length
                                        ? orders
                                              .map(orderCard)
                                              .join("")
                                        : `
                                            <div class="empty-state">
                                                <h3>
                                                    No orders yet
                                                </h3>

                                                <p class="muted">
                                                    Your purchases
                                                    will appear here
                                                    after checkout.
                                                </p>

                                                <a
                                                    class="btn btn-primary"
                                                    href="#/shop"
                                                >
                                                    Start Shopping
                                                </a>
                                            </div>
                                        `
                                }

                            </section>
                        `
                        : ""
                }

            </div>
        </section>
    `;
}

/* =========================================================
   ORDER CARD
   ========================================================= */

function orderCard(o) {
    const status =
        o.courierStatus === "Returned"
            ? "returned"
            : o.courierStatus === "Delivered" ||
              o.status === "delivered"
                ? "delivered"
                : o.courierStatus ===
                      "Sent to courier"
                    ? "confirmed"
                    : o.status;

    return `
        <article class="order-card">

            <div class="order-top">

                <div>
                    <span class="eyebrow">
                        ORDER #${esc(o.id)}
                    </span>

                    <h3>
                        ${esc(
                            (o.items || [])
                                .map(i => i.name)
                                .join(", ")
                        )}
                    </h3>

                    <small>
                        ${dateVal(o.createdAt)}
                    </small>
                </div>

                <strong>
                    ${money(o.total)}
                </strong>

            </div>

            <div
                style="
                    display:flex;
                    gap:9px;
                    flex-wrap:wrap;
                    align-items:center;
                    margin-top:12px
                "
            >

                <span
                    class="status-pill status-${status}"
                >
                    ${esc(
                        status === "pending"
                            ? "Incoming"
                            : status === "confirmed"
                                ? "Confirmed"
                                : String(
                                      status || ""
                                  )
                                      .charAt(0)
                                      .toUpperCase() +
                                  String(
                                      status || ""
                                  ).slice(1)
                    )}
                </span>

                <span class="tiny">
                    Courier:
                    ${esc(
                        o.courierStatus ||
                            "Not sent"
                    )}
                </span>

                <a
                    class="btn btn-light"
                    href="#/invoice/${o.id}"
                >
                    View Invoice
                </a>

            </div>

        </article>
    `;
}

/* =========================================================
   INVOICE
   ========================================================= */

async function invoicePage(id) {
    let o = state.data.orders.find(
        x => x.id === id
    );

    if (!o && firebaseReady) {
        const s = await db
            .collection("orders")
            .doc(id)
            .get();

        if (s.exists) {
            o = {
                id: s.id,
                ...s.data()
            };
        }
    }

    if (!o) {
        return `
            <section class="app-page">
                <div class="app-container">
                    <div class="panel">
                        <h1>Invoice not found</h1>
                    </div>
                </div>
            </section>
        `;
    }

    return `
        <main class="invoice-page">

            <div class="no-print">

                <a
                    class="btn btn-light"
                    href="#/orders"
                >
                    Back
                </a>

                <button
                    class="btn btn-primary"
                    onclick="window.print()"
                >
                    Print / Save PDF
                </button>

            </div>

            <article class="invoice">

                <div class="invoice-head">

                    <div>

                        <img
                            src="assets/azaro-logo.jpg"
                            class="invoice-logo"
                        >

                        <h1
                            style="
                                font-family:'Playfair Display',serif
                            "
                        >
                            AZARO
                        </h1>

                        <p>Own Your Style</p>

                    </div>

                    <div style="text-align:right">

                        <span class="eyebrow">
                            INVOICE
                        </span>

                        <h2>
                            #${esc(o.id)}
                        </h2>

                        <p>
                            ${dateVal(o.createdAt)}
                        </p>

                    </div>

                </div>

                <div
                    class="form-grid-2"
                    style="margin-top:24px"
                >

                    <div>
                        <b>BILLED TO</b>

                        <p>
                            ${esc(
                                o.customer?.name ||
                                    "Customer"
                            )}<br>

                            ${esc(
                                o.customer?.email ||
                                    ""
                            )}<br>

                            ${esc(
                                o.customer?.phone ||
                                    ""
                            )}<br>

                            ${esc(
                                o.address || ""
                            )}
                        </p>
                    </div>

                    <div>
                        <b>ORDER STATUS</b>

                        <p>
                            ${esc(
                                o.status ||
                                    "Incoming"
                            )}<br>

                            Courier:
                            ${esc(
                                o.courierStatus ||
                                    "Not sent"
                            )}<br>

                            Payment:
                            ${esc(
                                o.payment ||
                                    "Cash on Delivery"
                            )}
                        </p>
                    </div>

                </div>

                <table class="invoice-table">

                    <thead>
                        <tr>
                            <th>Item</th>
                            <th>Qty</th>
                            <th>Unit price</th>
                            <th>Total</th>
                        </tr>
                    </thead>

                    <tbody>
                        ${(o.items || [])
                            .map(
                                i => `
                                    <tr>
                                        <td>
                                            ${esc(i.name)}
                                        </td>

                                        <td>
                                            ${i.qty}
                                        </td>

                                        <td>
                                            ${money(i.price)}
                                        </td>

                                        <td>
                                            ${money(
                                                i.qty *
                                                    i.price
                                            )}
                                        </td>
                                    </tr>
                                `
                            )
                            .join("")}
                    </tbody>

                </table>

                <div class="invoice-total">

                    <div>
                        <span>Subtotal</span>
                        <b>${money(o.total)}</b>
                    </div>

                    <div>
                        <span>Delivery</span>
                        <b>
                            Included / confirmed at checkout
                        </b>
                    </div>

                    <div class="grand">
                        <span>Grand Total</span>
                        <b>${money(o.total)}</b>
                    </div>

                </div>

                <p
                    style="
                        margin-top:45px;
                        color:#6e767b
                    "
                >
                    Thank you for choosing AZARO.
                    Own Your Style.
                </p>

            </article>

        </main>
    `;
}

/* =========================================================
   AUTH PAGE
   ========================================================= */

function authPage(kind) {
    const reg = kind === "register";

    return `
        <section class="auth-shell">

            <div class="auth-card">

                <span class="eyebrow">
                    ${
                        reg
                            ? "JOIN AZARO"
                            : "AZARO — OWN YOUR STYLE"
                    }
                </span>

                <h1>
                    ${
                        reg
                            ? "Create your account"
                            : "Welcome back"
                    }
                </h1>

                <p class="muted">
                    ${
                        reg
                            ? "Create a buyer account and start shopping from AZARO."
                            : "Sign in to manage your account, orders and shopping cart."
                    }
                </p>

                <form
                    id="authForm"
                    class="form-grid"
                >

                    ${
                        reg
                            ? `
                                <div class="field">
                                    <label>Full name</label>
                                    <input
                                        name="name"
                                        required
                                    >
                                </div>
                            `
                            : ""
                    }

                    <div class="field">
                        <label>Email</label>

                        <input
                            name="email"
                            type="email"
                            required
                        >
                    </div>

                    ${
                        reg
                            ? `
                                <div class="field">
                                    <label>
                                        Mobile number *
                                    </label>

                                    <input
                                        name="phone"
                                        type="tel"
                                        required
                                    >

                                    <small class="field-help">
                                        Required for delivery
                                        and order contact.
                                    </small>
                                </div>
                            `
                            : ""
                    }

                    <div class="field">
                        <label>Password</label>

                        <input
                            name="password"
                            type="password"
                            minlength="6"
                            required
                        >
                    </div>

                    <button class="btn btn-primary">
                        ${
                            reg
                                ? "Create Buyer Account"
                                : "Login"
                        }
                    </button>

                </form>

                <p>
                    ${
                        reg
                            ? "Already have an account?"
                            : "New to AZARO?"
                    }

                    <a
                        href="#/${
                            reg
                                ? "login"
                                : "register"
                        }"
                    >
                        ${
                            reg
                                ? "Login"
                                : "Create an account"
                        }
                    </a>
                </p>

            </div>
        </section>
    `;
}

/* =========================================================
   ADMIN PAGE
   ========================================================= */

async function adminPage() {
    if (!requireStaff()) return "";

    return `
        <div class="admin-layout">

            <aside class="admin-side">

                <div class="admin-brand">
                    <span class="eyebrow">
                        AZARO
                    </span>

                    <h2>Store Control</h2>

                    <small>
                        Own Your Style
                    </small>
                </div>

                <div class="admin-user">

                    ${avatarHTML(
                        state.profile,
                        "avatar"
                    )}

                    <div>
                        <b>
                            ${esc(
                                state.profile?.name ||
                                    ""
                            )}
                        </b>

                        <small
                            style="
                                display:block;
                                color:#9fb0b4
                            "
                        >
                            ${esc(
                                state.profile?.role ||
                                    ""
                            )}
                        </small>
                    </div>

                </div>

                <nav
                    class="admin-nav"
                    id="adminNav"
                >

                    ${
                        [
                            [
                                "dashboard",
                                "layout-dashboard",
                                "Dashboard"
                            ],
                            [
                                "orders",
                                "package-check",
                                "Orders"
                            ],
                            [
                                "products",
                                "shirt",
                                "Products"
                            ],
                            [
                                "customers",
                                "users",
                                "Customers"
                            ],
                            [
                                "finance",
                                "wallet-cards",
                                "Finance"
                            ],
                            [
                                "analytics",
                                "chart-no-axes-combined",
                                "Analytics"
                            ],
                            [
                                "categories",
                                "tags",
                                "Categories"
                            ],
                            [
                                "store",
                                "store",
                                "Front Store"
                            ],
                            [
                                "reports",
                                "file-bar-chart",
                                "Reports"
                            ],
                            [
                                "management",
                                "settings-2",
                                "Management"
                            ],
                            [
                                "profile",
                                "user-circle",
                                "My Profile"
                            ]
                        ]
                            .map(
                                ([r, i, l]) => `
                                    <button
                                        data-admin-route="${r}"
                                        class="${
                                            location.hash.includes(
                                                "/admin/" +
                                                    r
                                            )
                                                ? "active"
                                                : ""
                                        }"
                                    >
                                        ${icon(i)}
                                        ${l}
                                    </button>
                                `
                            )
                            .join("")
                    }

                </nav>

            </aside>

            <main
                class="admin-main"
                id="adminContent"
            ></main>

        </div>
    `;
}

/* =========================================================
   ADMIN CONTENT
   ========================================================= */

async function renderAdminContent(route) {
    const root = $("#adminContent");

    if (!root) return;

    const products = state.data.products;
    const cats = state.data.categories;
    const orders = await getAllOrders();

    const usersSnapshot =
        await db.collection("users").get();

    const buyers = usersSnapshot.docs.map(
        d => ({
            id: d.id,
            ...d.data()
        })
    );

    if (route === "dashboard") {
        const sales = orders
            .filter(o =>
                ["confirmed", "delivered"].includes(
                    o.status
                )
            )
            .reduce(
                (a, o) =>
                    a + Number(o.total),
                0
            );

        root.innerHTML = `
            <div class="admin-top">

                <div class="admin-title">

                    <span class="eyebrow">
                        DASHBOARD / OVERVIEW
                    </span>

                    <h1>
                        Good to see you,
                        ${esc(
                            state.profile?.name
                        )}.
                    </h1>

                    <p class="muted">
                        A clean view of the
                        AZARO store today.
                    </p>

                </div>

                <a
                    class="btn btn-primary"
                    href="#/shop"
                >
                    View Store
                </a>

            </div>

            <div class="stat-grid">

                <div class="stat-card">
                    <span>Customers</span>
                    <strong>
                        ${
                            buyers.filter(
                                u =>
                                    u.role ===
                                    "buyer"
                            ).length
                        }
                    </strong>
                </div>

                <div class="stat-card">
                    <span>Active products</span>
                    <strong>
                        ${products.length}
                    </strong>
                </div>

                <div class="stat-card">
                    <span>Orders</span>
                    <strong>
                        ${orders.length}
                    </strong>
                </div>

                <div class="stat-card">
                    <span>Confirmed sales</span>
                    <strong>
                        ${money(sales)}
                    </strong>
                </div>

            </div>

            <section class="admin-card">

                <div class="admin-card-head">

                    <div>
                        <span class="eyebrow">
                            ATTENTION
                        </span>

                        <h2>Recent orders</h2>
                    </div>

                    <a
                        class="btn btn-light"
                        href="#/admin/orders"
                    >
                        Manage orders
                    </a>

                </div>

                ${
                    orders
                        .slice(0, 7)
                        .map(
                            o => `
                                <div class="category-item">

                                    <div>
                                        <b>
                                            #${esc(o.id)}
                                            ·
                                            ${esc(
                                                o.customer
                                                    ?.name ||
                                                    "Customer"
                                            )}
                                        </b>

                                        <small>
                                            ${esc(
                                                o.customer
                                                    ?.phone ||
                                                    ""
                                            )}
                                            ·
                                            ${dateVal(
                                                o.createdAt
                                            )}
                                        </small>
                                    </div>

                                    <div>
                                        <span class="status-pill">
                                            ${esc(
                                                o.courierStatus ===
                                                    "Returned"
                                                    ? "Returned"
                                                    : o.status ||
                                                      "Incoming"
                                            )}
                                        </span>

                                        <b>
                                            ${money(
                                                o.total
                                            )}
                                        </b>
                                    </div>

                                </div>
                            `
                        )
                        .join("") ||
                    '<p class="muted">No orders yet.</p>'
                }

            </section>
        `;
    }

    else if (route === "orders") {
        root.innerHTML =
            adminOrdersHTML(orders);
    }

    else if (route === "products") {
        root.innerHTML =
            adminProductsHTML(
                products,
                cats
            );
    }

    else if (route === "customers") {
        root.innerHTML =
            adminCustomersHTML(
                buyers
            );
    }

    else if (route === "finance") {
        const sales = orders
            .filter(o =>
                ["confirmed", "delivered"].includes(
                    o.status
                )
            )
            .reduce(
                (a, o) =>
                    a + Number(o.total),
                0
            );

        const confirmed =
            orders.filter(o =>
                ["confirmed", "delivered"].includes(
                    o.status
                )
            ).length;

        root.innerHTML = `
            <div class="admin-top">

                <div class="admin-title">
                    <span class="eyebrow">
                        FINANCE
                    </span>

                    <h1>Sales ledger</h1>
                </div>

            </div>

            <div class="stat-grid">

                <div class="stat-card">
                    <span>
                        Gross confirmed sales
                    </span>

                    <strong>
                        ${money(sales)}
                    </strong>
                </div>

                <div class="stat-card">
                    <span>
                        Confirmed / delivered
                    </span>

                    <strong>
                        ${confirmed}
                    </strong>
                </div>

                <div class="stat-card">
                    <span>Average order</span>

                    <strong>
                        ${money(
                            orders.length
                                ? sales /
                                      orders.length
                                : 0
                        )}
                    </strong>
                </div>

                <div class="stat-card">
                    <span>Returned</span>

                    <strong>
                        ${
                            orders.filter(
                                o =>
                                    o.courierStatus ===
                                    "Returned"
                            ).length
                        }
                    </strong>
                </div>

            </div>

            <section class="admin-card">

                <div class="admin-card-head">
                    <h2>Sales ledger</h2>
                </div>

                ${orders
                    .map(
                        o => `
                            <div class="category-item">

                                <div>
                                    <b>
                                        #${esc(o.id)}
                                    </b>

                                    <small>
                                        ${esc(
                                            o.customer
                                                ?.name ||
                                                "Customer"
                                        )}
                                        ·
                                        ${dateVal(
                                            o.createdAt
                                        )}
                                    </small>
                                </div>

                                <div>
                                    <span class="status-pill">
                                        ${esc(
                                            o.status ||
                                                ""
                                        )}
                                    </span>

                                    <b>
                                        ${money(
                                            o.total
                                        )}
                                    </b>
                                </div>

                            </div>
                        `
                    )
                    .join("")}

            </section>
        `;
    }

    else if (route === "analytics") {
        const confirmed =
            orders.filter(o =>
                ["confirmed", "delivered"].includes(
                    o.status
                )
            ).length;

        const delivered =
            orders.filter(
                o =>
                    o.status ===
                        "delivered" ||
                    o.courierStatus ===
                        "Delivered"
            ).length;

        const cr = orders.length
            ? Math.round(
                  (confirmed /
                      orders.length) *
                      100
              )
            : 0;

        const dr = confirmed
            ? Math.round(
                  (delivered /
                      confirmed) *
                      100
              )
            : 0;

        const returned =
            orders.filter(
                o =>
                    o.courierStatus ===
                    "Returned"
            ).length;

        root.innerHTML = `
            <div class="admin-top">

                <div class="admin-title">
                    <span class="eyebrow">
                        ANALYTICS
                    </span>

                    <h1>
                        Store performance
                    </h1>
                </div>

            </div>

            <div class="stat-grid">

                <div class="stat-card">
                    <span>
                        Confirmation rate
                    </span>

                    <strong>
                        ${cr}%
                    </strong>
                </div>

                <div class="stat-card">
                    <span>
                        Delivery rate
                    </span>

                    <strong>
                        ${dr}%
                    </strong>
                </div>

                <div class="stat-card">
                    <span>Catalog</span>

                    <strong>
                        ${products.length}
                    </strong>
                </div>

                <div class="stat-card">
                    <span>Buyers</span>

                    <strong>
                        ${
                            buyers.filter(
                                u =>
                                    u.role ===
                                    "buyer"
                            ).length
                        }
                    </strong>
                </div>

            </div>

            <section class="admin-card">

                <h2>Order funnel</h2>

                <div class="chart">

                    <div
                        class="bar"
                        style="height:${Math.max(
                            8,
                            cr
                        )}%"
                        title="Confirmed"
                    ></div>

                    <div
                        class="bar"
                        style="height:${Math.max(
                            8,
                            dr
                        )}%"
                        title="Delivered"
                    ></div>

                    <div
                        class="bar"
                        style="height:${Math.max(
                            8,
                            Math.round(
                                (returned /
                                    Math.max(
                                        1,
                                        orders.length
                                    )) *
                                    100
                            )
                        )}%"
                        title="Returned"
                    ></div>

                </div>

                <div
                    style="
                        display:flex;
                        justify-content:space-around
                    "
                >
                    <b>
                        Confirmed ${cr}%
                    </b>

                    <b>
                        Delivered ${dr}%
                    </b>

                    <b>
                        Returned ${returned}
                    </b>
                </div>

            </section>
        `;
    }

    else if (route === "categories") {
        root.innerHTML =
            adminCategoriesHTML(
                cats,
                products
            );
    }

    else if (route === "store") {
        root.innerHTML = `
            <div class="admin-top">

                <div class="admin-title">

                    <span class="eyebrow">
                        FRONT STORE
                    </span>

                    <h1>
                        AZARO storefront
                    </h1>

                    <p class="muted">
                        Preview the customer-facing
                        shopping experience.
                    </p>

                </div>

                <a
                    class="btn btn-primary"
                    href="#/"
                >
                    Open Store
                </a>

            </div>

            <section class="admin-card">

                <div class="grid">
                    ${products
                        .slice(0, 6)
                        .map(productCard)
                        .join("")}
                </div>

            </section>
        `;
    }

    else if (route === "reports") {
        const byCat = {};

        products.forEach(p => {
            const key =
                p.category ||
                "Other";

            byCat[key] =
                (byCat[key] || 0) +
                1;
        });

        root.innerHTML = `
            <div class="admin-top">

                <div class="admin-title">
                    <span class="eyebrow">
                        REPORTING
                    </span>

                    <h1>
                        Store reports
                    </h1>
                </div>

            </div>

            <section class="admin-card">

                <h2>
                    Catalog by category
                </h2>

                ${Object.entries(byCat)
                    .map(
                        ([k, v]) => `
                            <div class="category-item">
                                <b>${esc(k)}</b>
                                <span>
                                    ${v} products
                                </span>
                            </div>
                        `
                    )
                    .join("")}

            </section>

            <section class="admin-card">

                <h2>
                    Order status report
                </h2>

                ${[
                    "pending",
                    "confirmed",
                    "delivered",
                    "cancelled"
                ]
                    .map(
                        s => `
                            <div class="category-item">
                                <b>${esc(s)}</b>
                                <span>
                                    ${
                                        orders.filter(
                                            o =>
                                                o.status ===
                                                s
                                        ).length
                                    }
                                </span>
                            </div>
                        `
                    )
                    .join("")}

                <div class="category-item">
                    <b>Returned</b>

                    <span>
                        ${
                            orders.filter(
                                o =>
                                    o.courierStatus ===
                                    "Returned"
                            ).length
                        }
                    </span>
                </div>

            </section>
        `;
    }

    else if (route === "management") {
        root.innerHTML = `
            <div class="admin-top">

                <div class="admin-title">

                    <span class="eyebrow">
                        MANAGEMENT
                    </span>

                    <h1>
                        System management
                    </h1>

                </div>

            </div>

            <section class="admin-card">

                <h2>
                    Firebase setup
                </h2>

                <p class="muted">
                    This project is static.
                    Authentication and data live
                    in Firebase; no XAMPP or PHP
                    server is required.
                </p>

                <div class="seed-note">
                    Never place SMTP passwords or
                    Firebase Admin SDK credentials
                    in this frontend repository.
                </div>

                ${
                    products.length
                        ? `
                            <p
                                class="success"
                                style="margin-top:15px"
                            >
                                Catalog is already seeded.
                            </p>
                        `
                        : `
                            <button
                                class="btn btn-primary"
                                id="seedCatalog"
                            >
                                Seed demo catalog
                            </button>
                        `
                }

            </section>

            <section class="admin-card">

                <h2>
                    Role model
                </h2>

                <p>
                    Buyer = shopping account.
                    Moderator = internal
                    catalog/order staff.
                    Admin = full control.
                </p>

            </section>
        `;
    }

    else if (route === "profile") {
        root.innerHTML =
            await profilePageAdmin();
    }

    renderIcons();
    bindAdminContent(route);
}

/* =========================================================
   ADMIN ORDERS
   ========================================================= */

function adminOrdersHTML(orders) {
    return `
        <div class="admin-top">

            <div class="admin-title">

                <span class="eyebrow">
                    ORDERS
                </span>

                <h1>Orders</h1>

                <p class="muted">
                    Search and filter every incoming,
                    courier, delivered and returned order.
                </p>

            </div>

            <select
                id="orderFilter"
                class="admin-search"
            >
                <option value="all">
                    All orders
                </option>

                <option value="incoming">
                    Incoming
                </option>

                <option value="courier">
                    Sent to courier
                </option>

                <option value="delivered">
                    Delivered
                </option>

                <option value="returned">
                    Returned
                </option>
            </select>

        </div>

        <section class="admin-card">

            <div class="admin-card-head">

                <h2>
                    Order workspace
                </h2>

                <input
                    id="orderSearch"
                    class="admin-search"
                    placeholder="Search order, customer, phone..."
                >

            </div>

            <div class="admin-table-wrap">

                <table class="admin-table">

                    <thead>
                        <tr>
                            <th>Order</th>
                            <th>Customer</th>
                            <th>Items</th>
                            <th>Total</th>
                            <th>Status</th>
                            <th>Courier</th>
                            <th>Action</th>
                        </tr>
                    </thead>

                    <tbody id="ordersTbody">
                        ${orders
                            .map(adminOrderRow)
                            .join("")}
                    </tbody>

                </table>

            </div>

        </section>
    `;
}

function adminOrderRow(o) {
    return `
        <tr
            data-search="${esc(
                `${o.id} ${
                    o.customer?.name || ""
                } ${
                    o.customer?.email || ""
                } ${
                    o.customer?.phone || ""
                }`.toLowerCase()
            )}"
        >

            <td>
                <b>#${esc(o.id)}</b>
                <small>
                    ${dateVal(o.createdAt)}
                </small>
            </td>

            <td>
                <b>
                    ${esc(
                        o.customer?.name ||
                            "Customer"
                    )}
                </b>

                <small>
                    ${esc(
                        o.customer?.phone ||
                            ""
                    )}
                </small>
            </td>

            <td>
                ${esc(
                    (o.items || [])
                        .map(
                            i =>
                                `${i.name} × ${i.qty}`
                        )
                        .join(", ")
                )}
            </td>

            <td>
                <b>
                    ${money(o.total)}
                </b>
            </td>

            <td>
                <span class="status-pill">
                    ${esc(
                        o.status === "pending"
                            ? "Incoming"
                            : o.status
                    )}
                </span>
            </td>

            <td>
                <span class="status-pill">
                    ${esc(
                        o.courierStatus ||
                            "Not sent"
                    )}
                </span>
            </td>

            <td>

                <div class="admin-actions">

                    <button
                        class="admin-btn primary order-confirm"
                        data-id="${o.id}"
                    >
                        Confirm
                    </button>

                    <select
                        class="order-courier admin-btn"
                        data-id="${o.id}"
                    >

                        <option>
                            Not sent
                        </option>

                        <option
                            ${
                                o.courierStatus ===
                                "Sent to courier"
                                    ? "selected"
                                    : ""
                            }
                        >
                            Sent to courier
                        </option>

                        <option
                            ${
                                o.courierStatus ===
                                "Delivered"
                                    ? "selected"
                                    : ""
                            }
                        >
                            Delivered
                        </option>

                        <option
                            ${
                                o.courierStatus ===
                                "Returned"
                                    ? "selected"
                                    : ""
                            }
                        >
                            Returned
                        </option>

                    </select>

                    <a
                        class="admin-btn"
                        href="#/invoice/${o.id}"
                    >
                        Invoice
                    </a>

                </div>

            </td>

        </tr>
    `;
}

/* =========================================================
   ADMIN PRODUCTS
   ========================================================= */

function adminProductsHTML(
    products,
    cats
) {
    return `
        <div class="admin-top">

            <div class="admin-title">

                <span class="eyebrow">
                    PRODUCTS
                </span>

                <h1>
                    Catalog management
                </h1>

            </div>

            <button
                class="btn btn-primary"
                id="newProduct"
            >
                + New Product
            </button>

        </div>

        <section
            class="admin-card"
            id="productEditor"
            style="display:none"
        ></section>

        <section class="admin-card">

            <div class="admin-table-wrap">

                <table class="admin-table">

                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Category</th>
                            <th>Price</th>
                            <th>Stock</th>
                            <th>Discount</th>
                            <th>Visibility</th>
                            <th>Action</th>
                        </tr>
                    </thead>

                    <tbody>

                        ${products
                            .map(
                                p => `
                                    <tr>

                                        <td>
                                            <img
                                                class="product-admin-img"
                                                src="${esc(
                                                    pathImage(
                                                        p.image
                                                    )
                                                )}"
                                            >

                                            <b>
                                                ${esc(
                                                    p.name
                                                )}
                                            </b>
                                        </td>

                                        <td>
                                            ${esc(
                                                p.category ||
                                                    ""
                                            )}
                                        </td>

                                        <td>
                                            ${money(
                                                p.price
                                            )}
                                        </td>

                                        <td>
                                            ${p.stock}
                                        </td>

                                        <td>
                                            ${
                                                discount(
                                                    p.price,
                                                    p.comparePrice
                                                )
                                                    ? `-${discount(
                                                          p.price,
                                                          p.comparePrice
                                                      )}%`
                                                    : "—"
                                            }
                                        </td>

                                        <td>
                                            <span class="status-pill">
                                                ${esc(
                                                    p.status ||
                                                        "active"
                                                )}
                                            </span>
                                        </td>

                                        <td>

                                            <div class="admin-actions">

                                                <button
                                                    class="admin-btn edit-product"
                                                    data-id="${p.id}"
                                                >
                                                    Edit
                                                </button>

                                                <button
                                                    class="admin-btn ${
                                                        p.status ===
                                                        "active"
                                                            ? "danger"
                                                            : "primary"
                                                    } toggle-product"
                                                    data-id="${p.id}"
                                                    data-status="${p.status}"
                                                >
                                                    ${
                                                        p.status ===
                                                        "active"
                                                            ? "Block"
                                                            : "Activate"
                                                    }
                                                </button>

                                            </div>

                                        </td>

                                    </tr>
                                `
                            )
                            .join("")}

                    </tbody>

                </table>

            </div>

        </section>
    `;
}

/* =========================================================
   ADMIN CUSTOMERS
   ========================================================= */

function adminCustomersHTML(users) {
    return `
        <div class="admin-top">

            <div class="admin-title">

                <span class="eyebrow">
                    CUSTOMERS
                </span>

                <h1>
                    Customer directory
                </h1>

            </div>

            <input
                id="customerSearch"
                class="admin-search"
                placeholder="Search name, email, phone..."
            >

        </div>

        <section class="admin-card">

            <div class="admin-table-wrap">

                <table class="admin-table">

                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Phone</th>
                            <th>Role</th>
                            <th>Joined</th>
                            <th>Action</th>
                        </tr>
                    </thead>

                    <tbody>

                        ${users
                            .map(
                                u => `
                                    <tr
                                        data-search="${esc(
                                            `${u.name || ""} ${
                                                u.email || ""
                                            } ${
                                                u.phone || ""
                                            }`.toLowerCase()
                                        )}"
                                    >

                                        <td>
                                            <b>
                                                ${esc(
                                                    u.name ||
                                                        ""
                                                )}
                                            </b>

                                            <small>
                                                ${esc(
                                                    u.email ||
                                                        ""
                                                )}
                                            </small>
                                        </td>

                                        <td>
                                            ${esc(
                                                u.phone ||
                                                    u.mobile ||
                                                    "—"
                                            )}
                                        </td>

                                        <td>
                                            <span
                                                class="role-pill role-${esc(
                                                    u.role ||
                                                        "buyer"
                                                )}"
                                            >
                                                ${esc(
                                                    u.role ||
                                                        "buyer"
                                                )}
                                            </span>
                                        </td>

                                        <td>
                                            ${dateVal(
                                                u.createdAt
                                            )}
                                        </td>

                                        <td>
                                            ${
                                                isAdmin()
                                                    ? `
                                                        <select
                                                            class="role-select admin-btn"
                                                            data-id="${u.id}"
                                                        >
                                                            <option
                                                                value="buyer"
                                                                ${
                                                                    u.role ===
                                                                    "buyer"
                                                                        ? "selected"
                                                                        : ""
                                                                }
                                                            >
                                                                Buyer
                                                            </option>

                                                            <option
                                                                value="moderator"
                                                                ${
                                                                    u.role ===
                                                                    "moderator"
                                                                        ? "selected"
                                                                        : ""
                                                                }
                                                            >
                                                                Moderator
                                                            </option>

                                                            <option
                                                                value="admin"
                                                                ${
                                                                    u.role ===
                                                                    "admin"
                                                                        ? "selected"
                                                                        : ""
                                                                }
                                                            >
                                                                Admin
                                                            </option>
                                                        </select>
                                                    `
                                                    : "—"
                                            }
                                        </td>

                                    </tr>
                                `
                            )
                            .join("")}

                    </tbody>

                </table>

            </div>

        </section>
    `;
}

/* =========================================================
   ADMIN CATEGORIES
   ========================================================= */

function adminCategoriesHTML(
    cats,
    products
) {
    return `
        <div class="admin-top">

            <div class="admin-title">

                <span class="eyebrow">
                    PRODUCT SETUP
                </span>

                <h1>
                    Categories
                </h1>

            </div>

            <button
                class="btn btn-primary"
                id="newCategory"
            >
                + Add Category
            </button>

        </div>

        <section
            class="admin-card"
            id="categoryEditor"
            style="display:none"
        ></section>

        <section class="admin-card">

            <div class="category-list">

                ${cats
                    .map(
                        c => `
                            <div class="category-item">

                                <div>
                                    <b>
                                        ${esc(
                                            c.title
                                        )}
                                    </b>

                                    <small>
                                        ${
                                            products.filter(
                                                p =>
                                                    p.categoryId ===
                                                    c.id
                                            ).length
                                        }
                                        products
                                    </small>
                                </div>

                                <div class="admin-actions">

                                    <button
                                        class="admin-btn edit-category"
                                        data-id="${c.id}"
                                    >
                                        Edit
                                    </button>

                                    <button
                                        class="admin-btn danger delete-category"
                                        data-id="${c.id}"
                                    >
                                        Delete
                                    </button>

                                </div>

                            </div>
                        `
                    )
                    .join("")}

            </div>

        </section>
    `;
}

/* =========================================================
   ADMIN PROFILE
   ========================================================= */

async function profilePageAdmin() {
    return `
        <div class="admin-top">

            <div class="admin-title">

                <span class="eyebrow">
                    MY PROFILE
                </span>

                <h1>
                    Staff profile
                </h1>

            </div>

        </div>

        <section class="admin-card">

            <div
                style="
                    display:flex;
                    align-items:center;
                    gap:18px
                "
            >

                ${avatarHTML(
                    state.profile,
                    "avatar"
                )}

                <div>
                    <h2>
                        ${esc(
                            state.profile?.name ||
                                ""
                        )}
                    </h2>

                    <p class="muted">
                        ${esc(
                            state.profile?.email ||
                                ""
                        )}
                        ·
                        ${esc(
                            state.profile?.role ||
                                ""
                        )}
                    </p>
                </div>

            </div>

            <hr
                style="
                    border:0;
                    border-top:1px solid #eee9df;
                    margin:20px 0
                "
            >

            <form
                id="staffProfileForm"
                class="admin-form"
            >

                <div class="row">

                    <label>
                        Name

                        <input
                            name="name"
                            value="${esc(
                                state.profile?.name ||
                                    ""
                            )}"
                            required
                        >
                    </label>

                    <label>
                        Mobile

                        <input
                            name="phone"
                            value="${esc(
                                state.profile?.phone ||
                                    ""
                            )}"
                        >
                    </label>

                </div>

                <button
                    class="btn btn-primary"
                >
                    Save Profile
                </button>

            </form>

        </section>
    `;
}

/* =========================================================
   ADMIN BINDINGS
   ========================================================= */

function bindAdminContent(route) {

    $("#adminNav")
        ?.querySelectorAll("button")
        .forEach(
            b =>
                (b.onclick = () =>
                    nav(
                        "admin/" +
                            b.dataset
                                .adminRoute
                    ))
        );

    $("#orderSearch")?.addEventListener(
        "input",
        e => {
            $$("#ordersTbody tr").forEach(
                r =>
                    (r.style.display =
                        r.dataset.search.includes(
                            e.target.value
                                .toLowerCase()
                        )
                            ? ""
                            : "none")
            );
        }
    );

    $("#orderFilter")?.addEventListener(
        "change",
        e => {
            const val =
                e.target.value;

            $$("#ordersTbody tr").forEach(
                r => {
                    const text =
                        r.innerText.toLowerCase();

                    r.style.display =
                        val === "all" ||
                        (
                            val === "incoming" &&
                            text.includes(
                                "incoming"
                            )
                        ) ||
                        (
                            val === "courier" &&
                            text.includes(
                                "sent to courier"
                            )
                        ) ||
                        (
                            val === "delivered" &&
                            text.includes(
                                "delivered"
                            )
                        ) ||
                        (
                            val === "returned" &&
                            text.includes(
                                "returned"
                            )
                        )
                            ? ""
                            : "none";
                }
            );
        }
    );

    $$(".order-confirm").forEach(
        b =>
            (b.onclick = async () => {
                try {
                    await db
                        .collection("orders")
                        .doc(b.dataset.id)
                        .update({
                            status: "confirmed",
                            confirmedAt: TS
                        });

                    toast(
                        "Order confirmed."
                    );

                    await renderAdminContent(
                        "orders"
                    );
                } catch (err) {
                    console.error(err);

                    toast(
                        "Could not confirm order.",
                        "error"
                    );
                }
            })
    );

    $$(".order-courier").forEach(
        s =>
            (s.onchange = async () => {
                try {
                    const v =
                        s.value;

                    const patch = {
                        courierStatus: v
                    };

                    if (
                        v ===
                        "Delivered"
                    ) {
                        patch.status =
                            "delivered";
                    }

                    if (
                        v ===
                        "Returned"
                    ) {
                        patch.status =
                            "cancelled";
                    }

                    await db
                        .collection("orders")
                        .doc(s.dataset.id)
                        .update(patch);

                    toast(
                        "Courier status updated."
                    );

                    await renderAdminContent(
                        "orders"
                    );
                } catch (err) {
                    console.error(err);

                    toast(
                        "Could not update courier status.",
                        "error"
                    );
                }
            })
    );

    $("#customerSearch")?.addEventListener(
        "input",
        e =>
            $$("#adminContent tbody tr").forEach(
                r =>
                    (r.style.display =
                        r.dataset.search.includes(
                            e.target.value
                                .toLowerCase()
                        )
                            ? ""
                            : "none")
            )
    );

    $$(".role-select").forEach(
        s =>
            (s.onchange = async () => {
                if (!isAdmin()) return;

                try {
                    await db
                        .collection("users")
                        .doc(s.dataset.id)
                        .update({
                            role: s.value
                        });

                    toast(
                        "User role updated."
                    );
                } catch (err) {
                    console.error(err);

                    toast(
                        "Could not update role.",
                        "error"
                    );
                }
            })
    );

    $("#newProduct")?.addEventListener(
        "click",
        () => openProductEditor()
    );

    $$(".edit-product").forEach(
        b =>
            (b.onclick = () =>
                openProductEditor(
                    b.dataset.id
                ))
    );

    $$(".toggle-product").forEach(
        b =>
            (b.onclick = async () => {
                try {
                    await db
                        .collection("products")
                        .doc(b.dataset.id)
                        .update({
                            status:
                                b.dataset
                                    .status ===
                                "active"
                                    ? "blocked"
                                    : "active"
                        });

                    toast(
                        "Product visibility updated."
                    );

                    await renderAdminContent(
                        "products"
                    );
                } catch (err) {
                    console.error(err);

                    toast(
                        "Could not update product.",
                        "error"
                    );
                }
            })
    );

    $("#newCategory")?.addEventListener(
        "click",
        () => openCategoryEditor()
    );

    $$(".edit-category").forEach(
        b =>
            (b.onclick = () =>
                openCategoryEditor(
                    b.dataset.id
                ))
    );

    $$(".delete-category").forEach(
        b =>
            (b.onclick = async () => {
                if (
                    productsUsingCat(
                        b.dataset.id
                    )
                ) {
                    return toast(
                        "Move the products from this category first.",
                        "error"
                    );
                }

                try {
                    await db
                        .collection(
                            "categories"
                        )
                        .doc(b.dataset.id)
                        .delete();

                    toast(
                        "Category deleted."
                    );

                    await refreshData();

                    await renderAdminContent(
                        "categories"
                    );
                } catch (err) {
                    console.error(err);

                    toast(
                        "Could not delete category.",
                        "error"
                    );
                }
            })
    );

    $("#seedCatalog")?.addEventListener(
        "click",
        seedCatalog
    );

    $("#staffProfileForm")
        ?.addEventListener(
            "submit",
            async e => {
                e.preventDefault();

                try {
                    const f =
                        new FormData(
                            e.target
                        );

                    await db
                        .collection("users")
                        .doc(
                            state.user.uid
                        )
                        .update({
                            name:
                                f.get(
                                    "name"
                                ),
                            phone:
                                f.get(
                                    "phone"
                                )
                        });

                    state.profile =
                        await getProfile(
                            state.user.uid
                        );

                    toast(
                        "Profile updated."
                    );

                    await render();
                } catch (err) {
                    console.error(err);

                    toast(
                        "Could not update profile.",
                        "error"
                    );
                }
            }
        );
}

/* =========================================================
   CATEGORY EDITOR
   ========================================================= */

function productsUsingCat(id) {
    return state.data.products.some(
        p => p.categoryId === id
    );
}

function openCategoryEditor(id) {
    const c =
        state.data.categories.find(
            x => x.id === id
        );

    const box =
        $("#categoryEditor");

    if (!box) return;

    box.style.display = "block";

    box.innerHTML = `
        <form
            id="catForm"
            class="admin-form"
        >

            <h2>
                ${c ? "Edit" : "Add"}
                Category
            </h2>

            <input
                type="hidden"
                name="id"
                value="${c?.id || ""}"
            >

            <label>
                Category name

                <input
                    name="title"
                    required
                    value="${esc(
                        c?.title || ""
                    )}"
                >
            </label>

            <div>

                <button
                    class="btn btn-primary"
                >
                    Save Category
                </button>

                <button
                    type="button"
                    class="btn btn-light"
                    id="cancelCat"
                >
                    Cancel
                </button>

            </div>

        </form>
    `;

    $("#cancelCat").onclick = () => {
        box.style.display =
            "none";
    };

    $("#catForm").onsubmit =
        async e => {
            e.preventDefault();

            try {
                const f =
                    new FormData(
                        e.target
                    );

                const data = {
                    title:
                        f.get("title"),
                    updatedAt: TS
                };

                if (f.get("id")) {
                    await db
                        .collection(
                            "categories"
                        )
                        .doc(
                            f.get("id")
                        )
                        .update(
                            data
                        );
                } else {
                    await db
                        .collection(
                            "categories"
                        )
                        .add({
                            ...data,
                            createdAt:
                                TS
                        });
                }

                toast(
                    "Category saved."
                );

                await refreshData();

                await renderAdminContent(
                    "categories"
                );
            } catch (err) {
                console.error(err);

                toast(
                    "Could not save category.",
                    "error"
                );
            }
        };

    box.scrollIntoView({
        behavior: "smooth"
    });
}

/* =========================================================
   PRODUCT EDITOR
   ========================================================= */

function openProductEditor(id) {
    const p =
        state.data.products.find(
            x => x.id === id
        );

    const box =
        $("#productEditor");

    if (!box) return;

    box.style.display = "block";

    box.innerHTML = `
        <form
            id="productForm"
            class="admin-form"
        >

            <h2>
                ${p ? "Edit" : "Add"}
                Product
            </h2>

            <input
                type="hidden"
                name="id"
                value="${p?.id || ""}"
            >

            <div class="row">

                <label>
                    Name

                    <input
                        name="name"
                        required
                        value="${esc(
                            p?.name || ""
                        )}"
                    >
                </label>

                <label>
                    Category

                    <select
                        name="categoryId"
                        required
                    >
                        ${state.data.categories
                            .map(
                                c => `
                                    <option
                                        value="${c.id}"
                                        ${
                                            p?.categoryId ===
                                            c.id
                                                ? "selected"
                                                : ""
                                        }
                                    >
                                        ${esc(
                                            c.title
                                        )}
                                    </option>
                                `
                            )
                            .join("")}
                    </select>
                </label>

            </div>

            <div class="row">

                <label>
                    Current price

                    <input
                        name="price"
                        type="number"
                        step="0.01"
                        required
                        value="${p?.price || ""}"
                    >
                </label>

                <label>
                    Old price / compare price

                    <input
                        name="comparePrice"
                        type="number"
                        step="0.01"
                        value="${p?.comparePrice || ""}"
                    >
                </label>

            </div>

            <div class="row">

                <label>
                    Stock

                    <input
                        name="stock"
                        type="number"
                        min="0"
                        required
                        value="${p?.stock ?? 0}"
                    >
                </label>

                <label>
                    Image URL

                    <input
                        name="image"
                        value="${esc(
                            p?.image ||
                                "assets/product-placeholder.svg"
                        )}"
                    >
                </label>

            </div>

            <label>
                Description

                <textarea
                    name="content"
                >${esc(
                    p?.content || ""
                )}</textarea>
            </label>

            <div>

                <button
                    class="btn btn-primary"
                >
                    Save Product
                </button>

                <button
                    type="button"
                    class="btn btn-light"
                    id="cancelProduct"
                >
                    Cancel
                </button>

            </div>

        </form>
    `;

    $("#cancelProduct").onclick =
        () => {
            box.style.display =
                "none";
        };

    $("#productForm").onsubmit =
        async e => {
            e.preventDefault();

            try {
                const f =
                    new FormData(
                        e.target
                    );

                const data = {
                    name:
                        f.get("name"),

                    categoryId:
                        f.get(
                            "categoryId"
                        ),

                    price:
                        Number(
                            f.get(
                                "price"
                            )
                        ),

                    comparePrice:
                        f.get(
                            "comparePrice"
                        )
                            ? Number(
                                  f.get(
                                      "comparePrice"
                                  )
                              )
                            : null,

                    stock:
                        Number(
                            f.get(
                                "stock"
                            )
                        ),

                    image:
                        f.get(
                            "image"
                        ) ||
                        "assets/product-placeholder.svg",

                    content:
                        f.get(
                            "content"
                        ),

                    deliveryKind:
                        "Home Delivery",

                    status:
                        p?.status ||
                        "active",

                    updatedAt: TS
                };

                if (
                    data.comparePrice &&
                    data.comparePrice <=
                        data.price
                ) {
                    return toast(
                        "Old price must be higher than current price.",
                        "error"
                    );
                }

                if (f.get("id")) {
                    await db
                        .collection(
                            "products"
                        )
                        .doc(
                            f.get("id")
                        )
                        .update(
                            data
                        );
                } else {
                    await db
                        .collection(
                            "products"
                        )
                        .add({
                            ...data,
                            createdAt:
                                TS,
                            createdBy:
                                state.user
                                    .uid
                        });
                }

                toast(
                    "Product saved."
                );

                await refreshData();

                await renderAdminContent(
                    "products"
                );
            } catch (err) {
                console.error(err);

                toast(
                    "Could not save product.",
                    "error"
                );
            }
        };

    box.scrollIntoView({
        behavior: "smooth"
    });
}

/* =========================================================
   SEED CATALOG
   ========================================================= */

async function seedCatalog() {
    if (!isStaff()) return;

    try {
        const names = [
            "Shirts",
            "Pants",
            "Trousers",
            "Combo",
            "New Arrivals",
            "Essentials"
        ];

        const ids = {};

        for (const n of names) {
            const s =
                await db
                    .collection(
                        "categories"
                    )
                    .where(
                        "title",
                        "==",
                        n
                    )
                    .limit(1)
                    .get();

            if (s.empty) {
                const ref =
                    await db
                        .collection(
                            "categories"
                        )
                        .add({
                            title: n,
                            createdAt:
                                TS
                        });

                ids[n] =
                    ref.id;
            } else {
                ids[n] =
                    s.docs[0].id;
            }
        }

        const samples = [
            [
                "Classic Oxford Shirt",
                "A clean everyday shirt with a refined silhouette, soft hand-feel and easy styling for work or weekends.",
                1890,
                2290,
                30,
                "Shirts",
                "uploads/products/85cb1bf8275764a357ee0693.jpg"
            ],

            [
                "Relaxed Fit Cotton Pant",
                "Comfort-first cotton pants with a versatile straight fit for everyday movement.",
                2190,
                2590,
                25,
                "Pants",
                "uploads/products/13dea40378563efd40741b59.jpg"
            ],

            [
                "Tailored Essential Trouser",
                "A polished trouser with a clean line and understated finish for a smarter wardrobe.",
                2490,
                2990,
                20,
                "Trousers",
                "uploads/products/00556fc53215a029db7794fd.jpg"
            ],

            [
                "Everyday Style Combo",
                "A coordinated shirt and trouser pairing designed to make getting dressed effortless.",
                3990,
                4690,
                15,
                "Combo",
                "uploads/products/d627d24edb03e7af8b3fa258.jpg"
            ]
        ];

        for (const x of samples) {
            await db
                .collection("products")
                .add({
                    name: x[0],
                    content: x[1],
                    price: x[2],
                    comparePrice: x[3],
                    stock: x[4],
                    categoryId:
                        ids[x[5]],
                    category: x[5],
                    deliveryKind:
                        "Home Delivery",
                    image:
                        x[6] ||
                        "assets/product-placeholder.svg",
                    status: "active",
                    createdAt: TS,
                    createdBy:
                        state.user.uid
                });
        }

        toast(
            "Demo catalog created."
        );

        await refreshData();

        await renderAdminContent(
            "products"
        );
    } catch (err) {
        console.error(err);

        toast(
            "Could not create demo catalog.",
            "error"
        );
    }
}

/* =========================================================
   AUTH
   ========================================================= */

async function handleAuth(e, reg) {
    e.preventDefault();

    const f =
        new FormData(e.target);

    try {
        if (reg) {
            const name =
                String(
                    f.get("name")
                ).trim();

            const email =
                String(
                    f.get("email")
                ).trim();

            const phone =
                String(
                    f.get("phone")
                ).trim();

            const password =
                String(
                    f.get("password")
                );

            if (!phone) {
                return toast(
                    "Mobile number is required.",
                    "error"
                );
            }

            const cred =
                await auth.createUserWithEmailAndPassword(
                    email,
                    password
                );

            const profile = {
                name,
                email,
                phone,
                role: "buyer",
                photo: "",
                address: "",
                createdAt: TS
            };

            await db
                .collection("users")
                .doc(
                    cred.user.uid
                )
                .set(profile);

            state.profile =
                profile;

            toast(
                "Welcome to AZARO, " +
                    name +
                    "!"
            );

            nav("home");
        } else {
            const cred =
                await auth.signInWithEmailAndPassword(
                    String(
                        f.get("email")
                    ).trim(),
                    String(
                        f.get("password")
                    )
                );

            state.profile =
                await getProfile(
                    cred.user.uid
                );

            toast(
                "Welcome back, " +
                    (
                        state.profile
                            ?.name ||
                        "AZARO customer"
                    ) +
                    "!"
            );

            nav(
                isStaff()
                    ? "admin/dashboard"
                    : "home"
            );
        }
    } catch (err) {
        console.error(err);

        toast(
            authMessage(err),
            "error"
        );
    }
}

function authMessage(e) {
    if (
        e?.code ===
        "auth/email-already-in-use"
    ) {
        return "This email is already registered.";
    }

    if (
        e?.code ===
            "auth/invalid-credential" ||
        e?.code ===
            "auth/wrong-password" ||
        e?.code ===
            "auth/user-not-found"
    ) {
        return "Invalid email or password.";
    }

    if (
        e?.code ===
        "auth/weak-password"
    ) {
        return "Password must be at least 6 characters.";
    }

    if (
        e?.code ===
        "auth/invalid-email"
    ) {
        return "Please enter a valid email address.";
    }

    return (
        e?.message ||
        "Authentication failed."
    );
}

/* =========================================================
   OPTIONAL WELCOME EMAIL
   ========================================================= */

async function optionalWelcomeEmail(p) {
    const ec =
        window.AZARO_EMAILJS;

    if (
        !ec?.publicKey ||
        !ec?.serviceId ||
        !ec?.templateId
    ) {
        return;
    }

    try {
        await loadScript(
            "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"
        );

        if (
            !window.emailjs
        ) {
            return;
        }

        emailjs.init({
            publicKey:
                ec.publicKey
        });

        await emailjs.send(
            ec.serviceId,
            ec.templateId,
            {
                to_email:
                    p.email,
                to_name:
                    p.name,
                company:
                    "AZARO",
                tagline:
                    "Own Your Style"
            }
        );
    } catch (e) {
        console.warn(
            "Welcome email not configured/sent",
            e
        );
    }
}

function loadScript(src) {
    return new Promise(
        (res, rej) => {
            const s =
                document.createElement(
                    "script"
                );

            s.src = src;

            s.onload = res;
            s.onerror = rej;

            document.head.appendChild(
                s
            );
        }
    );
}

/* =========================================================
   SUBMIT ORDER
   ========================================================= */

async function submitOrder(e) {
    e.preventDefault();

    if (!requireAuth()) return;

    try {
        const c = cart();

        const items = c
            .map(x => ({
                ...x,
                p: state.data.products.find(
                    p => p.id === x.id
                )
            }))
            .filter(x => x.p);

        if (!items.length) {
            return toast(
                "Your bag is empty.",
                "error"
            );
        }

        const f =
            new FormData(e.target);

        const phone =
            String(
                f.get("phone")
            ).trim();

        const address =
            String(
                f.get("address")
            ).trim();

        if (!phone || !address) {
            return toast(
                "Mobile number and delivery address are required.",
                "error"
            );
        }

        const total =
            items.reduce(
                (a, x) =>
                    a +
                    x.qty *
                        x.p.price,
                0
            );

        const order = {
            userId:
                state.user.uid,

            customer: {
                name: f.get("name"),
                email:
                    state.profile.email,
                phone
            },

            address,

            payment:
                f.get("payment"),

            items: items.map(
                x => ({
                    productId:
                        x.p.id,
                    name:
                        x.p.name,
                    price:
                        Number(
                            x.p.price
                        ),
                    qty:
                        Number(
                            x.qty
                        ),
                    image:
                        x.p.image ||
                        ""
                })
            ),

            total,

            quantity:
                items.reduce(
                    (a, x) =>
                        a +
                        x.qty,
                    0
                ),

            status:
                "pending",

            courierStatus:
                "Not sent",

            createdAt: TS
        };

        const ref =
            await db
                .collection(
                    "orders"
                )
                .add(order);

        for (const x of items) {
            const latest =
                await db
                    .collection(
                        "products"
                    )
                    .doc(
                        x.p.id
                    )
                    .get();

            if (!latest.exists) {
                continue;
            }

            const latestProduct =
                latest.data();

            const newStock =
                Math.max(
                    0,
                    Number(
                        latestProduct.stock ||
                            0
                    ) -
                        Number(
                            x.qty
                        )
                );

            await db
                .collection(
                    "products"
                )
                .doc(
                    x.p.id
                )
                .update({
                    stock:
                        newStock
                });
        }

        await db
            .collection("users")
            .doc(
                state.user.uid
            )
            .update({
                name:
                    f.get("name"),
                phone,
                address
            });

        state.profile =
            await getProfile(
                state.user.uid
            );

        saveCart([]);

        toast(
            "Order placed successfully."
        );

        nav(
            "invoice/" +
                ref.id
        );
    } catch (err) {
        console.error(err);

        toast(
            err?.message ||
                "Could not place order.",
            "error"
        );
    }
}

/* =========================================================
   PROFILE SAVE
   ========================================================= */

async function profileSave(e) {
    e.preventDefault();

    try {
        const f =
            new FormData(e.target);

        if (!f.get("phone")) {
            return toast(
                "Mobile number is required.",
                "error"
            );
        }

        await db
            .collection("users")
            .doc(
                state.user.uid
            )
            .update({
                name:
                    f.get("name"),
                phone:
                    f.get("phone"),
                address:
                    f.get("address")
            });

        state.profile =
            await getProfile(
                state.user.uid
            );

        toast(
            "Profile updated."
        );

        await render();
    } catch (err) {
        console.error(err);

        toast(
            "Could not update profile.",
            "error"
        );
    }
}

/* =========================================================
   PASSWORD
   ========================================================= */

async function changePassword(e) {
    e.preventDefault();

    const f =
        new FormData(e.target);

    try {
        if (!auth.currentUser) {
            return toast(
                "Please login again.",
                "error"
            );
        }

        await updatePassword(
            auth.currentUser,
            String(
                f.get("password")
            )
        );

        toast(
            "Password updated."
        );

        e.target.reset();
    } catch (err) {
        console.error(err);

        if (
            err?.code ===
            "auth/requires-recent-login"
        ) {
            toast(
                "For security, login again before changing your password.",
                "error"
            );
        } else {
            toast(
                err?.message ||
                    "Could not update password.",
                "error"
            );
        }
    }
}

/* =========================================================
   PROFILE PHOTO
   ========================================================= */

async function savePhoto() {
    try {
        const file =
            $("#profilePhoto")
                ?.files?.[0];

        if (!file) {
            return toast(
                "Choose an image first.",
                "error"
            );
        }

        const data =
            await resizeImage(
                file,
                480,
                0.82
            );

        await db
            .collection("users")
            .doc(
                state.user.uid
            )
            .update({
                photo: data
            });

        state.profile =
            await getProfile(
                state.user.uid
            );

        toast(
            "Profile picture updated."
        );

        await render();
    } catch (err) {
        console.error(err);

        toast(
            "Could not update profile picture.",
            "error"
        );
    }
}

function resizeImage(
    file,
    max = 480,
    quality = 0.82
) {
    return new Promise(
        (resolve, reject) => {
            const img =
                new Image();

            img.onload = () => {
                const scale =
                    Math.min(
                        1,
                        max /
                            Math.max(
                                img.width,
                                img.height
                            )
                    );

                const c =
                    document.createElement(
                        "canvas"
                    );

                c.width =
                    Math.round(
                        img.width *
                            scale
                    );

                c.height =
                    Math.round(
                        img.height *
                            scale
                    );

                const ctx =
                    c.getContext(
                        "2d"
                    );

                ctx.drawImage(
                    img,
                    0,
                    0,
                    c.width,
                    c.height
                );

                resolve(
                    c.toDataURL(
                        "image/jpeg",
                        quality
                    )
                );
            };

            img.onerror =
                reject;

            img.src =
                URL.createObjectURL(
                    file
                );
        }
    );
}

/* =========================================================
   REVIEW
   ========================================================= */

async function reviewSubmit(
    e,
    id
) {
    e.preventDefault();

    if (!requireAuth()) return;

    try {
        const f =
            new FormData(e.target);

        const rid =
            `${id}_${state.user.uid}`;

        await db
            .collection("reviews")
            .doc(rid)
            .set(
                {
                    productId: id,
                    userId:
                        state.user.uid,
                    userName:
                        state.profile.name,
                    rating:
                        Number(
                            f.get(
                                "rating"
                            )
                        ),
                    comment:
                        f.get(
                            "comment"
                        ),
                    createdAt:
                        TS
                },
                {
                    merge: true
                }
            );

        toast(
            "Review saved."
        );

        await render();
    } catch (err) {
        console.error(err);

        toast(
            "Could not save review.",
            "error"
        );
    }
}

/* =========================================================
   REFRESH DATA
   ========================================================= */

async function refreshData() {
    if (!firebaseReady) return;

    state.data.categories =
        await getCategories();

    state.data.products =
        await getProducts(
            !!isStaff()
        );

    const cmap =
        Object.fromEntries(
            state.data.categories.map(
                c => [
                    c.id,
                    c.title
                ]
            )
        );

    state.data.products.forEach(
        p => {
            p.category =
                cmap[
                    p.categoryId
                ] ||
                p.category ||
                "AZARO";
        }
    );

    if (state.user) {
        state.data.orders =
            await getOrdersForUser(
                state.user.uid
            );
    } else {
        state.data.orders = [];
    }
}

/* =========================================================
   MAIN RENDER
   ========================================================= */

async function render() {
    if (!firebaseReady) {
        const app =
            $("#app");

        if (app) {
            app.innerHTML = `
                <div class="auth-shell">

                    <div class="auth-card">

                        <span class="eyebrow">
                            AZARO FIREBASE SETUP
                        </span>

                        <h1>
                            Connect your Firebase project
                        </h1>

                        <p class="muted">
                            Check your
                            <b>firebase-config.js</b>
                            file and make sure it exports
                            the Firebase Auth and Firestore
                            instances.
                        </p>

                        <p>
                            Example:
                            <br>
                            <code>
                                export const auth = getAuth(app);
                            </code>
                            <br>
                            <code>
                                export const db = getFirestore(app);
                            </code>
                        </p>

                    </div>

                </div>
            `;
        }

        return;
    }

    const h =
        location.hash || "#/";

    const parts =
        h.slice(2).split("/");

    state.route =
        parts[0] ||
        "home";

    const id =
        parts[1];

    if (
        state.route ===
        "admin"
    ) {
        $("#app").innerHTML =
            await adminPage();

        await renderAdminContent(
            parts[1] ||
                "dashboard"
        );

        renderIcons();

        return;
    }

    let content = "";

    try {
        if (
            state.route ===
            "home"
        ) {
            content =
                await home();
        }

        else if (
            state.route ===
            "shop"
        ) {
            content =
                await shop();
        }

        else if (
            state.route ===
            "product"
        ) {
            content =
                await productPage(
                    id
                );
        }

        else if (
            state.route ===
            "cart"
        ) {
            content =
                cartPage();
        }

        else if (
            state.route ===
            "checkout"
        ) {
            content =
                checkoutPage();
        }

        else if (
            state.route ===
            "orders"
        ) {
            content =
                ordersPage();
        }

        else if (
            state.route ===
            "profile"
        ) {
            content =
                await profilePage();
        }

        else if (
            state.route ===
            "invoice"
        ) {
            content =
                await invoicePage(
                    id
                );
        }

        else if (
            state.route ===
                "login" ||
            state.route ===
                "register"
        ) {
            content =
                authPage(
                    state.route
                );
        }

        else if (
            state.route ===
            "chat"
        ) {
            content = `
                <section class="app-page">

                    <div class="app-container">

                        <div class="panel">

                            <span class="eyebrow">
                                AZARO SUPPORT
                            </span>

                            <h1>
                                Chat with AZARO
                            </h1>

                            <p class="muted">
                                Use your support channel
                                or contact the store team.
                                This static build keeps
                                messaging data in Firebase
                                when enabled by your rules.
                            </p>

                            <p>
                                For a full real-time support
                                inbox, open the
                                <b>messages</b> collection
                                from the staff dashboard
                                extension or connect the
                                optional chat module.
                            </p>

                        </div>

                    </div>

                </section>
            `;
        }

        else {
            content =
                await home();
        }

        $("#app").innerHTML =
            shell(content);

        renderIcons();

        bindPage();

    } catch (e) {
        console.error(e);

        $("#app").innerHTML =
            shell(`
                <section class="app-page">

                    <div class="app-container">

                        <div class="panel">

                            <h1>
                                Something went wrong
                            </h1>

                            <p class="muted">
                                ${esc(
                                    e.message ||
                                        e
                                )}
                            </p>

                        </div>

                    </div>

                </section>
            `);
    }
}

/* =========================================================
   PAGE BINDINGS
   ========================================================= */

function bindPage() {

    $("#logoutLink")
        ?.addEventListener(
            "click",
            async e => {
                e.preventDefault();

                try {
                    await auth.signOut();

                    state.user =
                        null;

                    state.profile =
                        null;

                    state.data.orders =
                        [];

                    toast(
                        "Logged out."
                    );

                    nav("home");
                } catch (err) {
                    console.error(
                        err
                    );

                    toast(
                        "Could not logout.",
                        "error"
                    );
                }
            }
        );

    $("#globalSearch")
        ?.addEventListener(
            "submit",
            e => {
                e.preventDefault();

                const q =
                    new FormData(
                        e.target
                    ).get("q");

                location.hash =
                    "#/shop?q=" +
                    encodeURIComponent(
                        q
                    );
            }
        );

    $("#offerClose")
        ?.addEventListener(
            "click",
            () =>
                $(
                    "#offerPopup"
                )?.remove()
        );

    if (
        $("#offerPopup") &&
        !sessionStorage.getItem(
            "azaro_offer_seen"
        )
    ) {
        sessionStorage.setItem(
            "azaro_offer_seen",
            "1"
        );
    } else {
        $("#offerPopup")
            ?.remove();
    }

    $$(".add-btn").forEach(
        b =>
            (b.onclick = () =>
                addToCart(
                    b.dataset.id,
                    1
                ))
    );

    $("#detailAdd")
        ?.addEventListener(
            "click",
            () =>
                addToCart(
                    $(
                        "#detailAdd"
                    ).dataset.id,
                    Number(
                        $(
                            "#detailQty"
                        ).value || 1
                    )
                )
        );

    $("#shopFilter")
        ?.addEventListener(
            "submit",
            e => {
                e.preventDefault();

                const f =
                    new FormData(
                        e.target
                    );

                const p =
                    new URLSearchParams();

                for (
                    const [k, v] of f
                ) {
                    if (v) {
                        p.set(k, v);
                    }
                }

                location.hash =
                    "#/shop?" +
                    p.toString();
            }
        );

    $$(".cart-minus").forEach(
        b =>
            (b.onclick = () =>
                changeCartQty(
                    b.dataset.id,
                    -1
                ))
    );

    $$(".cart-plus").forEach(
        b =>
            (b.onclick = () =>
                changeCartQty(
                    b.dataset.id,
                    1
                ))
    );

    $$(".cart-remove").forEach(
        b =>
            (b.onclick = () => {
                saveCart(
                    cart().filter(
                        x =>
                            x.id !==
                            b.dataset.id
                    )
                );

                render();
            })
    );

    $$(".cart-qty").forEach(
        i =>
            (i.onchange = () =>
                setCartQty(
                    i.dataset.id,
                    Number(
                        i.value
                    )
                ))
    );

    $("#clearCart")
        ?.addEventListener(
            "click",
            () => {
                saveCart([]);

                render();
            }
        );

    $("#checkoutForm")
        ?.addEventListener(
            "submit",
            submitOrder
        );

    $("#authForm")
        ?.addEventListener(
            "submit",
            e =>
                handleAuth(
                    e,
                    state.route ===
                        "register"
                )
        );

    $("#profileForm")
        ?.addEventListener(
            "submit",
            profileSave
        );

    $("#passwordForm")
        ?.addEventListener(
            "submit",
            changePassword
        );

    $("#savePhoto")
        ?.addEventListener(
            "click",
            savePhoto
        );

    $("#reviewForm")
        ?.addEventListener(
            "submit",
            e =>
                reviewSubmit(
                    e,
                    idFromHash()
                )
        );

    if (
        state.route ===
        "orders"
    ) {
        getOrdersForUser(
            state.user.uid
        ).then(os => {
            const box =
                $("#buyerOrders");

            if (!box) return;

            box.innerHTML =
                os
                    .map(orderCard)
                    .join("") ||
                `
                    <div class="panel empty-state">
                        <h2>No orders yet.</h2>
                    </div>
                `;
        });
    }
}

/* =========================================================
   CART QUANTITY
   ========================================================= */

function idFromHash() {
    return (
        location.hash.split(
            "/"
        )[2] || ""
    );
}

function changeCartQty(
    id,
    delta
) {
    const c = cart();

    const x = c.find(
        i => i.id === id
    );

    if (!x) return;

    const p =
        state.data.products.find(
            p => p.id === id
        );

    const maxStock =
        p
            ? Number(p.stock)
            : Infinity;

    x.qty = Math.min(
        maxStock,
        Math.max(
            0,
            x.qty + delta
        )
    );

    saveCart(
        c.filter(
            i => i.qty > 0
        )
    );

    render();
}

function setCartQty(
    id,
    q
) {
    const c = cart();

    const x = c.find(
        i => i.id === id
    );

    if (!x) return;

    const p =
        state.data.products.find(
            p => p.id === id
        );

    const maxStock =
        p
            ? Number(p.stock)
            : Infinity;

    x.qty = Math.min(
        maxStock,
        Math.max(
            0,
            Number(q) || 0
        )
    );

    saveCart(
        c.filter(
            i => i.qty > 0
        )
    );

    render();
}

/* =========================================================
   HASH CHANGE
   ========================================================= */

window.addEventListener(
    "hashchange",
    async () => {
        try {
            if (state.user) {
                state.data.orders =
                    await getOrdersForUser(
                        state.user.uid
                    );
            }

            await render();
        } catch (err) {
            console.error(err);
        }
    }
);

/* =========================================================
   AUTH STATE
   ========================================================= */

if (firebaseReady) {

    auth.onAuthStateChanged(
        async u => {
            try {
                state.user =
                    u;

                if (u) {
                    state.profile =
                        await getProfile(
                            u.uid
                        );

                    if (
                        !state.profile
                    ) {
                        await db
                            .collection(
                                "users"
                            )
                            .doc(
                                u.uid
                            )
                            .set({
                                name:
                                    u.email
                                        ? u.email.split(
                                              "@"
                                          )[0]
                                        : "AZARO Customer",

                                email:
                                    u.email ||
                                    "",

                                phone:
                                    "",

                                role:
                                    "buyer",

                                photo:
                                    "",

                                address:
                                    "",

                                createdAt:
                                    TS
                            });

                        state.profile =
                            await getProfile(
                                u.uid
                            );
                    }
                } else {
                    state.profile =
                        null;

                    state.data.orders =
                        [];
                }

                await refreshData();

                await render();

            } catch (err) {
                console.error(
                    "Auth state error:",
                    err
                );

                await render();
            }
        }
    );

} else {
    await render();
}