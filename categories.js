/* SmartStock — categories.js */
(function () {
  'use strict';
  const SS = (window.SmartStock = window.SmartStock || {});
  const { el } = SS.utils; const ui = SS.ui;

  const all = () => SS.storage.read('categories');
  const productCount = (id, activeOnly) => SS.storage.read('products').filter((p) => p.categoryId === id && (!activeOnly || p.status !== 'archived')).length;
  const nameTaken = (name, exceptId) => all().some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === name.trim().toLowerCase());

  function save(data, id) {
    const name = data.name.trim();
    if (!name) throw new Error('Category name is required.');
    if (nameTaken(name, id)) throw new Error('A category with this name already exists.');
    if (id) {
      const before = SS.storage.collection.byId('categories', id);
      const next = SS.storage.collection.update('categories', id, { name, description: data.description.trim() });
      SS.audit.record('category.updated', { type: 'category', id, label: name }, { name: before.name }, { name });
      return next;
    }
    const rec = SS.storage.collection.insert('categories', { name, description: data.description.trim(), status: 'active' }, 'cat');
    SS.audit.record('category.created', { type: 'category', id: rec.id, label: name }, null, { name });
    return rec;
  }

  function openForm(id, onDone) {
    const cur = id ? SS.storage.collection.byId('categories', id) : null;
    const name = el('input', { class: 'input', id: 'catName', value: cur ? cur.name : '', maxlength: '80' });
    const desc = el('textarea', { class: 'input', id: 'catDesc' }, cur ? cur.description || '' : '');
    SS.utils.openModal({ title: cur ? 'Edit category' : 'New category', body: el('form', { id: 'catForm', novalidate: true }, ui.field('Name', 'catName', name), ui.field('Description', 'catDesc', desc)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: SS.i18n.t('save'), kind: 'primary', onClick: () => {
        try { ui.setError(name, ''); save({ name: name.value, description: desc.value }, id); SS.utils.toast('Category saved.', 'success'); if (onDone) onDone(); }
        catch (e) { ui.setError(name, e.message); return false; }
      } }] });
  }

  function setStatus(id, status) {
    const c = SS.storage.collection.byId('categories', id);
    SS.storage.collection.update('categories', id, { status });
    SS.audit.record('category.' + (status === 'archived' ? 'archived' : 'restored'), { type: 'category', id, label: c.name });
  }

  /** Delete requires reassigning products first when the category is in use. */
  function deleteCategory(id, onDone) {
    const c = SS.storage.collection.byId('categories', id); const n = productCount(id);
    if (!n) {
      SS.utils.confirmDialog('Delete category?', `“${c.name}” is not used by any product and will be permanently deleted.`, 'Delete', true).then((ok) => {
        if (!ok) return; SS.storage.collection.remove('categories', id); SS.audit.record('category.deleted', { type: 'category', id, label: c.name }); SS.utils.toast('Category deleted.', 'success'); onDone();
      });
      return;
    }
    const others = all().filter((x) => x.id !== id && x.status !== 'archived');
    if (!others.length) return SS.utils.toast(`${n} product(s) use this category. Create another category to move them to first, or archive this one instead.`, 'warning');
    const target = ui.select('catTarget', others.map((o) => [o.id, o.name]));
    SS.utils.openModal({ title: 'Reassign products before deleting', body: el('div', null, el('p', null, `${n} product(s) (including archived) use “${c.name}”. Choose a category to move them to.`), ui.field('Move products to', 'catTarget', target)),
      actions: [{ label: SS.i18n.t('cancel') }, { label: 'Move & delete', kind: 'danger', onClick: () => {
        try {
          const products = SS.storage.read('products').map((p) => (p.categoryId === id ? Object.assign({}, p, { categoryId: target.value, updatedAt: Date.now() }) : p));
          SS.storage.write('products', products); SS.storage.collection.remove('categories', id);
          SS.audit.record('category.deleted', { type: 'category', id, label: c.name }, { products: n }, { movedTo: target.value });
          SS.utils.toast('Category deleted; products reassigned.', 'success'); onDone();
        } catch (e) { SS.utils.toast(e.message, 'error'); return false; }
      } }] });
  }

  function page(root) {
    const st = { search: '', status: 'active' };
    const holder = el('div', { class: 'card' });
    function draw() {
      const rows = all().filter((c) => (st.status === 'all' || (c.status || 'active') === st.status) && (!st.search || (c.name + ' ' + (c.description || '')).toLowerCase().includes(st.search.toLowerCase())));
      const t = ui.dataTable({ rows, pageSize: 15, empty: { title: 'No categories yet', hint: 'Create your first category to organise products.' }, columns: [
        { key: 'name', label: 'Category', render: (c) => el('span', null, c.name, c.description ? el('span', { class: 'sub' }, c.description) : null) },
        { key: 'count', label: 'Products', num: true, sortValue: (c) => productCount(c.id, true), render: (c) => String(productCount(c.id, true)) },
        { key: 'status', label: 'Status', render: (c) => (c.status === 'archived' ? ui.badge('Archived', 'warning') : ui.badge('Active', 'success')) },
        { key: 'act', label: '', sortable: false, render: (c) => el('div', { class: 'row-actions' },
          el('button', { class: 'btn sm', type: 'button', onclick: () => openForm(c.id, draw) }, 'Edit'),
          el('button', { class: 'btn sm', type: 'button', onclick: () => { setStatus(c.id, c.status === 'archived' ? 'active' : 'archived'); draw(); } }, c.status === 'archived' ? 'Restore' : 'Archive'),
          el('button', { class: 'btn sm', type: 'button', onclick: () => deleteCategory(c.id, draw) }, 'Delete')) }] });
      SS.utils.clear(holder); holder.append(t.node);
    }
    const search = el('input', { class: 'input grow', type: 'search', placeholder: 'Search categories…', 'aria-label': 'Search categories' });
    search.addEventListener('input', SS.utils.debounce(() => { st.search = search.value; draw(); }, 150));
    const status = ui.select('catStatus', [['active', 'Active'], ['archived', 'Archived'], ['all', 'All']], st.status);
    status.addEventListener('change', () => { st.status = status.value; draw(); });
    root.append(el('div', { class: 'page-head' }, el('div', null, el('h1', null, SS.i18n.t('categories'))), el('button', { class: 'btn primary', type: 'button', onclick: () => openForm(null, draw) }, '+ New category')),
      el('div', { class: 'toolbar' }, search, status), holder);
    draw();
  }

  SS.categories = { all, productCount, save, openForm, options(includeArchivedId) { return all().filter((c) => c.status !== 'archived' || c.id === includeArchivedId); } };
  SS.pages = SS.pages || {}; SS.pages.categories = page;
})();
