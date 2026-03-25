// assets/js/data-service.js — Hisab Rakho Full Data Service
// Uses Firebase's built-in offline persistence — all writes queue offline and auto-sync

const DataService = {

  // ── OFFLINE FAST CACHING ──────────────────────────────────
  async _fastQuery(query) {
    if (!navigator.onLine) return query.get({ source: 'cache' }).catch(() => query.get());
    const pServer = query.get({ source: 'default' });
    const pTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500));
    try {
      return await Promise.race([pServer, pTimeout]);
    } catch(e) {
      console.warn('[Firebase] Query timeout/offline, falling back to cache');
      return query.get({ source: 'cache' }).catch(() => query.get());
    }
  },

  async _fastDoc(docRef) {
    if (!navigator.onLine) return docRef.get({ source: 'cache' }).catch(() => docRef.get());
    const pServer = docRef.get({ source: 'default' });
    const pTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2500));
    try {
      return await Promise.race([pServer, pTimeout]);
    } catch(e) {
      console.warn('[Firebase] Doc timeout/offline, falling back to cache');
      return docRef.get({ source: 'cache' }).catch(() => docRef.get());
    }
  },

  // ── CUSTOMERS ──────────────────────────────────────────────
  async getCustomers() {
    const shopId = getShopId(); if (!shopId) return [];
    try {
      const snap = await this._fastQuery(db.collection('customers').where('shopId','==',shopId));
      let docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return docs.filter(c => c.deleted !== true).sort((a,b) => (a.name||'').localeCompare(b.name||''));
    } catch(e) { console.error('getCustomers:', e); return []; }
  },

  async getCustomer(id) {
    try { const doc = await this._fastDoc(db.collection('customers').doc(id)); return doc.exists ? { id: doc.id, ...doc.data() } : null; }
    catch(e) { console.error('getCustomer:', e); return null; }
  },

  async saveCustomer(data) {
    const user = auth.currentUser; const shopId = getShopId();
    if (!user || !shopId) throw new Error('Not logged in');
    
    // Prevent duplicates by checking if phone number exists
    if(data.phone) {
       try {
         const exist = await db.collection('customers').where('shopId','==',shopId).where('deleted','==',false).where('phone','==',data.phone).limit(1).get();
         if(!exist.empty) {
            const exDoc = exist.docs[0];
            const exId = exDoc.id;
            const currentBal = exDoc.data().balance || 0;
            // Merge existing
            await db.collection('customers').doc(exId).update({
               name: data.name || exDoc.data().name,
               address: data.address || exDoc.data().address,
               notes: data.notes || exDoc.data().notes,
               balance: currentBal + (data.balance || 0),
               updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return exId;
         }
       } catch(e) { console.warn('Duplicate check failed', e); }
    }

    await this.enforceLimits('customers', 25, 'You have reached the 25 customer limit on Free plan.');
    const ref = db.collection('customers').doc();
    const payload = { ...data, shopId, balance: data.balance || 0, deleted: false, createdBy: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    await ref.set(payload);
    await this.logAudit('create', 'customer', ref.id, payload);
    return ref.id;
  },

  async updateCustomer(id, data) {
    const user = auth.currentUser; if (!user) throw new Error('Not logged in');
    const payload = { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    await db.collection('customers').doc(id).update(payload);
    await this.logAudit('update', 'customer', id, payload);
  },

  async deleteCustomer(id, name) {
    const user = auth.currentUser; if (!user) throw new Error('Not logged in');
    await db.collection('customers').doc(id).update({ deleted: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await this.logAudit('delete', 'customer', id, { name });
  },

  // ── PRODUCTS / INVENTORY ───────────────────────────────────
  async getProducts() {
    const shopId = getShopId(); if (!shopId) return [];
    try {
      const snap = await this._fastQuery(db.collection('products').where('shopId','==',shopId));
      let docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return docs.filter(p => p.deleted !== true).sort((a,b) => (a.name||'').localeCompare(b.name||''));
    } catch(e) { console.error('getProducts:', e); return []; }
  },

  async getProduct(id) {
    try { const doc = await this._fastDoc(db.collection('products').doc(id)); return doc.exists ? { id: doc.id, ...doc.data() } : null; }
    catch(e) { console.error('getProduct:', e); return null; }
  },

  async saveProduct(data) {
    const user = auth.currentUser; const shopId = getShopId();
    if (!user || !shopId) throw new Error('Not logged in');
    await this.enforceLimits('products', 50, 'You have reached the 50 product limit on Free plan.');
    const ref = db.collection('products').doc();
    const payload = { ...data, shopId, deleted: false, lowStock: (data.stock <= (data.lowStockAlert || 5)), createdBy: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    await ref.set(payload);
    await this.logAudit('create', 'product', ref.id, payload);
    return ref.id;
  },

  async updateProduct(id, data) {
    const user = auth.currentUser; if (!user) throw new Error('Not logged in');
    const payload = { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (data.stock !== undefined) payload.lowStock = data.stock <= (data.lowStockAlert || 5);
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
    await db.collection('products').doc(id).update(payload);
    await this.logAudit('update', 'product', id, payload);
  },

  async deleteProduct(id, name) {
    const user = auth.currentUser; if (!user) throw new Error('Not logged in');
    await db.collection('products').doc(id).update({ deleted: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    await this.logAudit('delete', 'product', id, { name });
  },

  // ── BILLS / SALES ──────────────────────────────────────────
  async saveBill(billData, items) {
    const user = auth.currentUser; const shopId = getShopId();
    if (!user || !shopId) throw new Error('Not logged in');

    const batch = db.batch();
    const saleRef = db.collection('sales').doc();
    const profit = items.reduce((sum, item) => sum + ((item.salePrice - (item.purchasePrice || 0)) * item.qty), 0);
    
    const salePayload = { ...billData, id: saleRef.id, shopId, profit: Math.max(0, profit), deleted: false, createdBy: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    batch.set(saleRef, salePayload);

    items.forEach(item => {
      const itemRef = db.collection('sale_items').doc();
      batch.set(itemRef, { ...item, saleId: saleRef.id, shopId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
      if (item.productId && item.productId !== 'custom') {
        batch.update(db.collection('products').doc(item.productId), { stock: firebase.firestore.FieldValue.increment(-item.qty), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
    });

    // Handle Udhaar (credit) and Mixed partial credits
    let creditToAdd = 0;
    if (billData.paymentType === 'udhaar') {
      creditToAdd = billData.creditAmount !== undefined ? billData.creditAmount : billData.totalAmount;
    } else if (billData.paymentType === 'mixed') {
      creditToAdd = billData.creditAmount || 0;
    }

    if (creditToAdd > 0 && billData.customerId) {
      batch.update(db.collection('customers').doc(billData.customerId), { balance: firebase.firestore.FieldValue.increment(creditToAdd), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      const txRef = db.collection('customer_transactions').doc();
      batch.set(txRef, { shopId, customerId: billData.customerId, saleId: saleRef.id, type: 'udhaar_added', amount: creditToAdd, description: `Bill #${billData.billNumber}`, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    }

    await batch.commit();
    await this.logAudit('create', 'sale', saleRef.id, { billNumber: billData.billNumber, total: billData.totalAmount });
    return saleRef.id;
  },

  async getBills(limit = 50) {
    const shopId = getShopId(); if (!shopId) return [];
    try {
      const snap = await this._fastQuery(db.collection('sales').where('shopId','==',shopId));
      let docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      docs = docs.filter(s => s.deleted !== true).sort((a,b) => {
        const ta = a.createdAt?.seconds || 0;
        const tb = b.createdAt?.seconds || 0;
        return tb - ta;
      });
      return docs.slice(0, limit);
    } catch(e) { console.error('getBills:', e); return []; }
  },

  // ── SUPPLIERS ──────────────────────────────────────────────
  async getSuppliers() {
    const shopId = getShopId(); if (!shopId) return [];
    try {
      const snap = await this._fastQuery(db.collection('suppliers').where('shopId','==',shopId));
      let docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return docs.filter(s => s.deleted !== true).sort((a,b) => (a.name||'').localeCompare(b.name||''));
    } catch(e) { console.error('getSuppliers:', e); return []; }
  },

  async saveSupplier(data) {
    const user = auth.currentUser; const shopId = getShopId();
    if (!user || !shopId) throw new Error('Not logged in');
    const ref = db.collection('suppliers').doc();
    await ref.set({ ...data, shopId, deleted: false, createdAt: firebase.firestore.FieldValue.serverTimestamp(), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    return ref.id;
  },

  async updateSupplier(id, data) {
    await db.collection('suppliers').doc(id).update({ ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  },

  async deleteSupplier(id) {
    await db.collection('suppliers').doc(id).update({ deleted: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  },

  // ── EXPENSES ───────────────────────────────────────────────
  async getExpenses(limit = 100) {
    const shopId = getShopId(); if (!shopId) return [];
    try {
      const snap = await this._fastQuery(db.collection('expenses').where('shopId','==',shopId));
      let docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return docs.sort((a,b) => ((b.createdAt?.seconds||0) - (a.createdAt?.seconds||0))).slice(0, limit);
    } catch(e) { console.error('getExpenses:', e); return []; }
  },

  async saveExpense(data) {
    const user = auth.currentUser; const shopId = getShopId();
    if (!user || !shopId) throw new Error('Not logged in');
    const ref = db.collection('expenses').doc();
    await ref.set({ ...data, shopId, createdBy: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    return ref.id;
  },

  async deleteExpense(id) {
    await db.collection('expenses').doc(id).delete();
  },

  // ── RETURNS ────────────────────────────────────────────────
  async getReturns(limit = 100) {
    const shopId = getShopId(); if (!shopId) return [];
    try {
      const snap = await this._fastQuery(db.collection('returns').where('shopId','==',shopId));
      let docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return docs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)).slice(0, limit);
    } catch(e) { console.error('getReturns:', e); return []; }
  },

  async saveReturn(data) {
    const user = auth.currentUser; const shopId = getShopId();
    if (!user || !shopId) throw new Error('Not logged in');
    const ref = db.collection('returns').doc();
    await ref.set({ ...data, shopId, createdBy: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    // Optionally restore stock
    if (data.productId) {
      await db.collection('products').doc(data.productId).update({ stock: firebase.firestore.FieldValue.increment(data.qty || 1), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    }
    return ref.id;
  },

  async deleteReturn(id) {
    await db.collection('returns').doc(id).delete();
  },

  // ── DAILY CASH ─────────────────────────────────────────────
  async getDailyCash(date) {
    const shopId = getShopId(); if (!shopId) return null;
    try {
      const doc = await this._fastDoc(db.collection('daily_cash').doc(`${shopId}_${date}`));
      return doc.exists ? doc.data() : null;
    } catch(e) { console.error('getDailyCash:', e); return null; }
  },

  async saveDailyCash(date, data) {
    const shopId = getShopId(); if (!shopId) throw new Error('No shop');
    await db.collection('daily_cash').doc(`${shopId}_${date}`).set({ ...data, shopId, date, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  },

  // ── CUSTOMER PAYMENTS (Udhaar) ─────────────────────────────
  async recordPayment(customerId, amount, notes = '') {
    const user = auth.currentUser; const shopId = getShopId();
    if (!user || !shopId) throw new Error('Not logged in');
    const batch = db.batch();
    // Reduce customer balance
    batch.update(db.collection('customers').doc(customerId), { balance: firebase.firestore.FieldValue.increment(-amount), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    // Log transaction
    const txRef = db.collection('customer_transactions').doc();
    batch.set(txRef, { shopId, customerId, type: 'payment_received', amount, notes, createdBy: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    await this.logAudit('create', 'payment', txRef.id, { customerId, amount });
    return txRef.id;
  },

  async getCustomerTransactions(customerId) {
    try {
      // No orderBy to avoid composite index requirement; sort client-side
      const snap = await this._fastQuery(db.collection('customer_transactions').where('customerId','==',customerId));
      let docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return docs.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0)).slice(0, 50);
    } catch(e) { console.error('getCustomerTx:', e); return []; }
  },

  // ── DASHBOARD STATS ────────────────────────────────────────
  async getDashboardStats() {
    const shopId = getShopId(); if (!shopId) return {};
    const today = new Date(); today.setHours(0,0,0,0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const todayTs = firebase.firestore.Timestamp.fromDate(today);
    const monthTs = firebase.firestore.Timestamp.fromDate(monthStart);

    try {
      const [todaySales, monthSales, products, customers] = await Promise.all([
        this._fastQuery(db.collection('sales').where('shopId','==',shopId).where('deleted','==',false).where('createdAt','>=',todayTs)),
        this._fastQuery(db.collection('sales').where('shopId','==',shopId).where('deleted','==',false).where('createdAt','>=',monthTs)),
        this._fastQuery(db.collection('products').where('shopId','==',shopId).where('deleted','==',false)),
        this._fastQuery(db.collection('customers').where('shopId','==',shopId).where('deleted','==',false))
      ]);

      let todayRevenue = 0, monthRevenue = 0, todayProfit = 0;
      todaySales.docs.forEach(d => { const s = d.data(); todayRevenue += s.totalAmount || s.total || 0; todayProfit += s.profit || 0; });
      monthSales.docs.forEach(d => { const s = d.data(); monthRevenue += s.totalAmount || s.total || 0; });

      const lowStockCount = products.docs.filter(d => d.data().lowStock).length;
      const totalUdhaar = customers.docs.reduce((sum, d) => sum + (d.data().balance || 0), 0);

      return { todayRevenue, todayProfit, todaySalesCount: todaySales.size, monthRevenue, monthSalesCount: monthSales.size, totalProducts: products.size, lowStockCount, totalCustomers: customers.size, totalUdhaar };
    } catch(e) { console.error('getDashboardStats:', e); return {}; }
  },

  // ── AUDIT LOG ──────────────────────────────────────────────
  async logAudit(action, entity, entityId, newData = null, oldData = null) {
    try {
      const shopId = getShopId(); const user = auth.currentUser;
      if (!shopId || !user) return;
      await db.collection('audit_logs').add({ shopId, action, entity, entityId, newData, oldData, userId: user.uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    } catch(e) { console.warn('Audit log failed (likely offline):', e.message); }
  },

  // ── FIX DATABASE (MIGRATION) ───────────────────────────────
  async fixDatabase() {
    const shopId = getShopId();
    if (!shopId) {
      alert("No shop ID found! Please login normally first.");
      return;
    }
    const collections = ['products', 'customers', 'sales', 'suppliers', 'expenses', 'returns'];
    let totalFixed = 0;
    for (const col of collections) {
      try {
        const snap = await db.collection(col).get();
        const batch = db.batch();
        let count = 0;
        snap.docs.forEach(doc => {
          const data = doc.data();
          if (!data.shopId && data.createdBy === auth.currentUser?.uid) {
            batch.update(doc.ref, { shopId: shopId });
            count++;
          }
        });
        if (count > 0) {
          await batch.commit();
          totalFixed += count;
          console.log(`Fixed ${count} orphaned documents in ${col}`);
        }
      } catch (e) {
        console.warn(`Could not fix collection ${col}:`, e.message);
      }
    }
    alert(totalFixed > 0 ? `Database fixed! Successfully restored ${totalFixed} missing records.` : `Database is already up to date. No orphaned records found.`);
  },

  // ── PLAN LIMITS ────────────────────────────────────────────
  async enforceLimits(collectionName, freeLimit, message, dateFilter = null) {
    const shopId = getShopId();
    const config = JSON.parse(localStorage.getItem('hr_shop') || '{}');
    const plan = config.subscription || 'free';
    if (plan !== 'free') return;
    
    let query = db.collection(collectionName).where('shopId','==',shopId).where('deleted','==',false);
    if (dateFilter) query = query.where('createdAt','>=',dateFilter);
    
    const snap = await query.get({ source: 'cache' }).catch(() => query.get());
    if (snap.size >= freeLimit) {
      this.triggerUpgradeModal(message);
      throw new Error(`Limit reached: ${message}`);
    }
  },

  triggerUpgradeModal(msg) {
    let modal = document.getElementById('global-upgrade-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'global-upgrade-modal';
      Object.assign(modal.style, { position:'fixed',inset:'0',zIndex:'99999',background:'rgba(4,13,18,0.85)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Plus Jakarta Sans', sans-serif" });
      modal.innerHTML = `<div style="background:#0D1E2E;border:1px solid rgba(0,201,177,.2);border-radius:16px;padding:24px;max-width:320px;text-align:center">
        <div style="font-size:36px;margin-bottom:12px">⚡</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">Upgrade Required</div>
        <div id="upgrade-msg" style="font-size:13px;color:rgba(232,240,247,0.7);margin-bottom:20px;line-height:1.5"></div>
        <button onclick="location.href='subscription.html'" style="width:100%;padding:12px;background:linear-gradient(135deg,#00C9B1,#009E8E);color:#040D12;border:none;border-radius:8px;font-weight:700;cursor:pointer;margin-bottom:8px">Upgrade to Pro</button>
        <button onclick="document.getElementById('global-upgrade-modal').style.display='none'" style="width:100%;padding:10px;background:transparent;color:rgba(232,240,247,0.5);border:none;cursor:pointer;font-size:12px">Dismiss</button>
      </div>`;
      document.body.appendChild(modal);
    }
    document.getElementById('upgrade-msg').textContent = msg;
    modal.style.display = 'flex';
  }
};

window.DataService = DataService;
