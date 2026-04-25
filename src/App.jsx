import React, { useState, useEffect, useMemo, useRef } from 'react';
import Layout from './components/Layout';
import { categories } from './data/mockData';
import { supabase } from './supabaseClient';
import * as pdfjsLib from 'pdfjs-dist';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const iconColors = {
  pdf: 'bg-red-50 text-red-700 border border-red-100',
  link: 'bg-indigo-50 text-indigo-700 border border-indigo-100',
  doc: 'bg-blue-50 text-blue-700 border border-blue-100',
  ppt: 'bg-orange-50 text-orange-700 border border-orange-100',
  sheet: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  folder: 'bg-gray-100 text-gray-700 border border-gray-200'
};

function App() {
  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');

  // Deep search state
  const [searchResults, setSearchResults] = useState(null); // null = mostrar todos
  const [isDeepSearching, setIsDeepSearching] = useState(false);
  const [contentMatchIds, setContentMatchIds] = useState(new Set());
  const [titleMatchIds, setTitleMatchIds] = useState(new Set());
  const [descMatchIds, setDescMatchIds] = useState(new Set());
  const [contentSnippets, setContentSnippets] = useState({}); // { [id]: string[] }
  const searchTimerRef = useRef(null);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewResource, setPreviewResource] = useState(null);
  const [folderViewResource, setFolderViewResource] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFileReading, setIsFileReading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // File variables
  const [selectedFile, setSelectedFile] = useState(null);
  const [isFolderUpload, setIsFolderUpload] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '', description: '', category: 'Documentación Técnica', type: 'pdf', url: '', fileContent: ''
  });

  useEffect(() => { fetchResources(); }, []);

  const fetchResources = async () => {
    try {
      setIsLoading(true);
      // No cargamos file_content aquí — puede ser muy grande. La búsqueda profunda la hacemos aparte.
      const { data, error } = await supabase
        .from('resources')
        .select('id,title,description,category,type,url,views,created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setResources(data || []);
    } catch (error) {
      console.error('Error cargando recursos:', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Deep search con debounce: busca en Supabase incluyendo file_content
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const term = searchTerm.trim();
    if (!term) {
      setSearchResults(null);
      setContentMatchIds(new Set());
      setTitleMatchIds(new Set());
      setDescMatchIds(new Set());
      setContentSnippets({});
      setIsDeepSearching(false);
      return;
    }

    setIsDeepSearching(true);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const likeParam = `%${term}%`;
        const { data, error } = await supabase
          .from('resources')
          .select('id,title,description,category,type,url,views,created_at,file_content')
          .or(`title.ilike.${likeParam},description.ilike.${likeParam},file_content.ilike.${likeParam}`);

        if (error) throw error;

        const norm = normalizeStr(term);
        const newContentMatchIds = new Set();
        const newTitleMatchIds = new Set();
        const newDescMatchIds = new Set();
        const newSnippets = {};

        const cleaned = (data || []).map((row) => {
          const hitTitle = row.title && normalizeStr(row.title).includes(norm);
          const hitDesc = row.description && normalizeStr(row.description).includes(norm);
          
          if (hitTitle) newTitleMatchIds.add(row.id);
          if (hitDesc) newDescMatchIds.add(row.id);

          if (row.file_content && normalizeStr(row.file_content).includes(norm)) {
            newContentMatchIds.add(row.id);
            newSnippets[row.id] = extractSnippets(row.file_content, norm, 3, 120);
          }
          return row;
        });

        setSearchResults(cleaned);
        setContentMatchIds(newContentMatchIds);
        setTitleMatchIds(newTitleMatchIds);
        setDescMatchIds(newDescMatchIds);
        setContentSnippets(newSnippets);
      } catch (err) {
        console.error('Error en deep search:', err.message);
        // Fallback: filtrado local sin file_content
        setSearchResults(null);
        setContentMatchIds(new Set());
        setTitleMatchIds(new Set());
        setDescMatchIds(new Set());
      } finally {
        setIsDeepSearching(false);
      }
    }, 350);

    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [searchTerm]);

  const normalizeStr = (str) => {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const extractSnippets = (text, normTerm, maxSnippets = 3, contextChars = 120) => {
    if (!text || !normTerm) return [];
    
    // Formatear el texto de forma más limpia para la vista previa
    let friendlyText = text
        .replace(/\[---\s*Archivo:\s*(.*?)\s*---\]/g, ' [📄 $1] ')
        .replace(/#\s*Contenido:\s*(.*?)(?=\n|$)/g, ' [📄 $1] ')
        .replace(/\s+/g, ' '); // unificar espacios
        
    const normText = normalizeStr(friendlyText);
    const snippets = [];
    let searchFrom = 0;
    
    while (snippets.length < maxSnippets) {
      const idx = normText.indexOf(normTerm, searchFrom);
      if (idx === -1) break;
      const start = Math.max(0, idx - contextChars);
      const end = Math.min(friendlyText.length, idx + normTerm.length + contextChars);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < friendlyText.length ? '…' : '';
      
      let rawSnippet = friendlyText.slice(start, end).trim();
      // Eliminar etiquetas cortadas a la mitad en los bordes por el recorte de caracteres
      rawSnippet = rawSnippet.replace(/^[^\[]*\]/, '').replace(/\[[^\]]*$/, '').trim();
      
      snippets.push(prefix + rawSnippet + suffix);
      searchFrom = idx + normTerm.length;
    }
    return snippets;
  };

  const filteredResources = useMemo(() => {
    // Si hay resultados de búsqueda de Supabase, los usamos
    const base = searchResults !== null ? searchResults : resources;

    return base.filter((res) => {
      // Si ya tenemos searchResults de Supabase, el filtro de categoría es lo único que falta
      if (searchResults !== null) {
        return selectedCategory === 'Todos' || res.category === selectedCategory;
      }
      // Fallback local: filtrado básico por título y descripción
      const norm = normalizeStr(searchTerm);
      if (!norm) return selectedCategory === 'Todos' || res.category === selectedCategory;
      const matchesSearch =
        (res.title && normalizeStr(res.title).includes(norm)) ||
        (res.description && normalizeStr(res.description).includes(norm));
      const matchesCategory = selectedCategory === 'Todos' || res.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [resources, searchResults, searchTerm, selectedCategory]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Extractors
  const extractPdfText = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ');
      }
      return text;
    } catch (err) {
      alert("Error interno al escanear el PDF: " + err.message);
      return '';
    }
  };

  const extractWordText = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (err) { return ''; }
  };

  const extractExcelText = async (file) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer);
      let text = '';
      Object.keys(workbook.Sheets).forEach(sheetName => {
        text += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]) + '\n';
      });
      return text;
    } catch (err) { return ''; }
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (isFolderUpload) {
        setIsFileReading(true);
        const filesArray = Array.from(files);
        setSelectedFile(filesArray);

        let newTitle = formData.title;
        const pathParts = filesArray[0].webkitRelativePath.split('/');
        if (pathParts.length > 0 && !formData.title) newTitle = pathParts[0];

        let folderText = '';
        for (let f of filesArray) {
          const fn = f.name.toLowerCase();
          try {
            let extracted = '';
            if (fn.endsWith('.pdf')) extracted = await extractPdfText(f);
            else if (fn.endsWith('.docx') || fn.endsWith('.doc')) extracted = await extractWordText(f);
            else if (fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) extracted = await extractExcelText(f);
            else if (fn.endsWith('.txt') || fn.endsWith('.md') || fn.endsWith('.js') || fn.endsWith('.json')) extracted = await f.text();
            
            if (extracted.trim()) {
              folderText += `\n[--- Archivo: ${f.webkitRelativePath || f.name} ---]\n${extracted} `;
            }
          } catch (e) { console.warn("Could not extract folder file:", fn); }
        }

        setFormData(prev => ({ ...prev, title: newTitle, type: 'folder', category: 'Otros', fileContent: folderText }));
        setIsFileReading(false);
      } else {
        let mainFile = files[0];
        setSelectedFile(mainFile);

        let newTitle = formData.title;
        if (!formData.title) newTitle = mainFile.name.replace(/\.[^/.]+$/, "");

        const fileName = mainFile.name.toLowerCase();
        const mimeType = mainFile.type.toLowerCase();
        let newType = 'doc';
        let newCategory = formData.category;

        setIsFileReading(true);
        let extractedText = '';

        try {
          if (fileName.endsWith('.pdf')) { newType = 'pdf'; newCategory = 'Documentación Técnica'; extractedText = await extractPdfText(mainFile); }
          else if (fileName.endsWith('.docx') || fileName.endsWith('.doc') || mimeType.includes('word')) { newType = 'doc'; extractedText = await extractWordText(mainFile); }
          else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv') || mimeType.includes('excel') || mimeType.includes('sheet')) { newType = 'sheet'; newCategory = 'Bases de Datos'; extractedText = await extractExcelText(mainFile); }
          else if (fileName.endsWith('.pptx') || fileName.endsWith('.ppt') || mimeType.includes('presentation')) { newType = 'ppt'; }
          else if (mimeType.includes('image')) { newType = 'link'; }
          else if (mimeType.includes('text') || fileName.endsWith('.json') || fileName.endsWith('.js') || fileName.endsWith('.md')) { newType = 'doc'; newCategory = 'Desarrollo Frontend'; extractedText = await mainFile.text(); }
        } catch (e) {
          console.error("Error al extraer texto:", e);
        }

        setFormData(prev => ({ ...prev, title: newTitle, type: newType, category: newCategory, fileContent: extractedText }));
        setIsFileReading(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setUploadProgress('');

    try {
      let finalUrl = formData.url || '#';

      if (isFolderUpload && Array.isArray(selectedFile) && selectedFile.length > 0) {
        const folderUUID = `${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
        const uploadedFilesMeta = [];

        for (let i = 0; i < selectedFile.length; i++) {
          const file = selectedFile[i];
          setUploadProgress(`Subiendo archivo ${i + 1} de ${selectedFile.length}...`);
          const supabasePath = `folders/${folderUUID}/${file.webkitRelativePath}`;

          const { error: uploadError } = await supabase.storage.from('company_resources').upload(supabasePath, file, { contentType: file.type, upsert: false });

          if (!uploadError) {
            const { data: publicUrlData } = supabase.storage.from('company_resources').getPublicUrl(supabasePath);
            uploadedFilesMeta.push({ name: file.name, path: file.webkitRelativePath, url: publicUrlData.publicUrl, type: file.type || 'unknown' });
          }
        }
        finalUrl = "folder:" + JSON.stringify({ id: folderUUID, files: uploadedFilesMeta });
        setUploadProgress('');

      } else if (selectedFile && !Array.isArray(selectedFile)) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from('company_resources').upload(fileName, selectedFile, { contentType: selectedFile.type, upsert: false });
        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from('company_resources').getPublicUrl(fileName);
        finalUrl = publicUrlData.publicUrl;
      }

      const resourcePayload = {
        title: formData.title, description: formData.description || '', category: formData.category, type: formData.type, url: finalUrl, file_content: formData.fileContent
      };

      if (editingId) {
        const { error } = await supabase.from('resources').update(resourcePayload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('resources').insert([resourcePayload]);
        if (error) throw error;
      }

      await fetchResources();
      closeModal();
    } catch (error) {
      console.error('Error guardando recurso:', error.message);
      alert('Hubo un error al guardar o subir el archivo. Vuelve a intentarlo.');
    } finally {
      setIsSubmitting(false);
      setUploadProgress('');
    }
  };

  const handleEdit = (resource) => {
    setFormData({ title: resource.title, description: resource.description, category: resource.category, type: resource.type, url: resource.url, fileContent: resource.file_content || '' });
    setEditingId(resource.id);
    setSelectedFile(null);
    setIsModalOpen(true);
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const handleDelete = async (id) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    try {
      const { error } = await supabase.from('resources').delete().eq('id', id);
      if (error) throw error;
      setResources(prev => prev.filter(r => r.id !== id));
      setConfirmDeleteId(null);
    } catch (error) { console.error('Error eliminando:', error); }
  };

  const cancelDelete = () => setConfirmDeleteId(null);

  const openPreview = async (resource) => {
    try {
      const { error } = await supabase.from('resources').update({ views: resource.views + 1 }).eq('id', resource.id);
      if (!error) setResources(prev => prev.map(r => r.id === resource.id ? { ...r, views: r.views + 1 } : r));
    } catch (err) { }

    if (resource.type === 'folder') { setFolderViewResource(resource); return; }

    const isPDF = resource.url.includes('.pdf') || resource.type === 'pdf';
    const isImageOrMedia = resource.url.match(/\.(jpeg|jpg|gif|png|webp|webp\/|mp4)$/i) != null;
    const isWebLink = resource.url.startsWith('https://');

    if (isPDF || isImageOrMedia || isWebLink) setPreviewResource(resource);
    else window.open(resource.url, '_blank');
  };

  const forceDownload = async (url, customTitle) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a'); link.style.display = 'none'; link.href = objectUrl;
      const urlParts = url.split('.'); const extension = urlParts.length > 1 ? `.${urlParts.pop()}` : '';
      link.download = `${customTitle}${extension}`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(objectUrl);
    } catch (e) { window.open(url, '_blank'); }
  };

  const downloadFolderZip = async (resource) => {
    try {
      const data = JSON.parse(resource.url.replace('folder:', ''));
      if (!data.files || data.files.length === 0) { alert("La carpeta está vacía."); return; }
      alert("Procesando ZIP de la carpeta... Por favor espera.");
      const zip = new JSZip();

      await Promise.all(data.files.map(async (file) => {
        const resp = await fetch(file.url); const blob = await resp.blob(); zip.file(file.path, blob);
      }));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const objectUrl = window.URL.createObjectURL(zipBlob);
      const link = document.createElement('a'); link.href = objectUrl; link.download = `${resource.title}.zip`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link); window.URL.revokeObjectURL(objectUrl);
    } catch (err) { console.error("Zip error", err); alert("Hubo un error al crear el ZIP."); }
  };

  const closeModal = () => {
    setIsModalOpen(false); setEditingId(null);
    setFormData({ title: '', description: '', category: 'Documentación Técnica', type: 'pdf', url: '', fileContent: '' });
    setSelectedFile(null); setIsFileReading(false); setUploadProgress('');
  };

  return (
    <Layout>


      <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-12">
        <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-6 mb-10">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-gray-900 mb-2">OmniDirectorio</h1>
            <p className="text-gray-500 text-lg">Repositorio Corporativo de Documentos</p>
          </div>
          <button className="btn-primary" onClick={() => setIsModalOpen(true)}>
            <span className="text-xl leading-none">+</span> Añadir Recurso
          </button>
        </div>

        <div className="flex flex-col xl:flex-row gap-6 mb-10 items-start xl:items-center justify-between">
          <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 scrollbar-hide flex-1">
            {categories.map(cat => (
              <button
                key={cat}
                className={`px-4 py-1.5 rounded-sm text-sm font-semibold transition-all whitespace-nowrap ${selectedCategory === cat ? 'bg-gray-900 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full xl:w-[450px] shrink-0">
            {isDeepSearching ? (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-base animate-spin select-none">⏳</span>
            ) : (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
            )}
            <input
              type="text"
              className="w-full py-2.5 px-3 pl-10 rounded-sm border border-gray-300 bg-white text-gray-800 text-sm focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900 transition-all shadow-sm"
              placeholder="Búsqueda en documentos y carpetas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition text-lg leading-none"
                title="Limpiar búsqueda"
              >✕</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {isLoading ? (
            <div className="col-span-full py-20 text-center">
              <h2 className="text-xl text-slate-500 font-medium animate-pulse">Cargando recursos desde Supabase...</h2>
            </div>
          ) : filteredResources.length > 0 ? (
            filteredResources.map(resource => (
              <div key={resource.id} className={`bg-white border rounded-sm p-5 flex flex-col group relative transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-gray-400 overflow-hidden ${searchTerm.trim() && (contentMatchIds.has(resource.id) || titleMatchIds.has(resource.id) || descMatchIds.has(resource.id))
                ? 'border-blue-400 shadow-blue-100/50'
                : 'border-gray-200'
                }`}>

                {/* Badge deep-search match */}
                {searchTerm.trim() && (
                  <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1 max-w-[75%] z-10">
                    {titleMatchIds.has(resource.id) && (
                      <span className="bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap">
                        Nombre
                      </span>
                    )}
                    {descMatchIds.has(resource.id) && (
                      <span className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap">
                        Descripción
                      </span>
                    )}
                    {contentMatchIds.has(resource.id) && (
                      <span className="bg-violet-50 border border-violet-200 text-violet-700 text-[10px] font-bold px-2 py-0.5 rounded-sm whitespace-nowrap">
                        Contenido
                      </span>
                    )}
                  </div>
                )}

                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button className="icon-btn" onClick={() => { setConfirmDeleteId(null); handleEdit(resource); }} title="Editar">✏️</button>
                  {confirmDeleteId === resource.id ? (
                    <>
                      <button
                        className="text-[10px] font-bold px-2 py-1 rounded-sm bg-red-600 text-white hover:bg-red-700 transition"
                        onClick={() => handleDelete(resource.id)}
                        title="Confirmar eliminación"
                      >¿Eliminar?</button>
                      <button
                        className="text-[10px] font-bold px-2 py-1 rounded-sm bg-gray-200 text-gray-700 hover:bg-gray-300 transition"
                        onClick={cancelDelete}
                      >No</button>
                    </>
                  ) : (
                    <button className="icon-btn hover:border-red-600 hover:text-red-600" onClick={() => handleDelete(resource.id)} title="Eliminar">🗑️</button>
                  )}
                </div>

                <div className={`w-12 h-12 rounded-sm flex items-center justify-center text-2xl shadow-sm ${(searchTerm.trim() && (contentMatchIds.has(resource.id) || titleMatchIds.has(resource.id) || descMatchIds.has(resource.id))) ? 'mt-6' : ''} mb-5 ${iconColors[resource.type] || iconColors.doc}`}>
                  {resource.type === 'pdf' ? '📄' :
                    resource.type === 'link' ? '🔗' :
                      resource.type === 'doc' ? '📝' :
                        resource.type === 'ppt' ? '📊' :
                          resource.type === 'sheet' ? '📈' : '📁'}
                </div>

                <div className="flex-1 mb-5">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1.5 block">{resource.category}</span>
                  <h3 className="text-base font-bold text-gray-900 leading-tight mb-2 line-clamp-2">{resource.title}</h3>
                  <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">{resource.description || <i className="opacity-60">Sin descripción general.</i>}</p>
                  {contentMatchIds.has(resource.id) && contentSnippets[resource.id]?.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <span className="text-[10px] font-bold tracking-wider uppercase text-blue-500 block">Aparece en el documento:</span>
                      {contentSnippets[resource.id].map((snippet, i) => (
                        <p key={i} className="text-[11px] text-gray-600 bg-blue-50 border border-blue-100 rounded-sm px-2.5 py-1.5 leading-relaxed line-clamp-2">
                          {snippet}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-gray-100 flex justify-between items-center mt-auto">
                  <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">👁️ {resource.views}</span>
                  <div className="flex items-center gap-2">
                    {resource.type === 'folder' ? (
                      <>
                        <button className="text-xs font-bold px-3 py-1.5 rounded-sm border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition" onClick={() => openPreview(resource)}>Docs</button>
                        <button onClick={() => downloadFolderZip(resource)} className="text-xs font-bold px-3 py-1.5 rounded-sm bg-gray-900 text-white hover:bg-black transition">ZIP</button>
                      </>
                    ) : (
                      <>
                        <button className="text-xs font-bold px-3 py-1.5 rounded-sm border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition" onClick={() => openPreview(resource)}>Ver</button>
                        <button onClick={() => forceDownload(resource.url, resource.title)} className="text-xs font-bold px-3 py-1.5 rounded-sm bg-gray-900 text-white hover:bg-black transition">Descargar</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-24 bg-white border border-dashed border-slate-300 rounded-2xl">
              <div className="text-6xl mb-4 opacity-50">☁️</div>
              <h2 className="text-2xl font-bold text-slate-700 mb-2">No se encontraron resultados</h2>
              <p className="text-slate-500">Puedes empezar a subir archivos o probar otra búsqueda.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {previewResource && previewResource.type !== 'folder' && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 lg:p-10 animate-fade-in">
          <div className="bg-white w-full h-full max-h-[90vh] max-w-5xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800">{previewResource.title}</h2>
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 font-bold text-slate-500 transition" onClick={() => setPreviewResource(null)}>✕</button>
            </div>
            <div className="flex-1 bg-slate-200 relative">
              {previewResource.url && previewResource.url !== '#' ? (
                <iframe src={previewResource.url} title={previewResource.title} className="w-full h-full border-none"></iframe>
              ) : (
                <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-medium text-slate-500">Mala referencia URL</p>
              )}
            </div>
          </div>
        </div>
      )}

      {folderViewResource && (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 lg:p-10 animate-fade-in">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-slide-up">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-amber-50">
              <h2 className="text-xl font-bold text-amber-900">Carpeta: {folderViewResource.title}</h2>
              <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-200 font-bold text-amber-800 transition" onClick={() => setFolderViewResource(null)}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              <ul className="flex flex-col gap-3">
                {(() => {
                  try {
                    const data = JSON.parse(folderViewResource.url.replace('folder:', ''));
                    if (!data.files || data.files.length === 0) return <p className="text-slate-500 italic pb-5">La carpeta está vacía.</p>;
                    
                    const folderContent = folderViewResource.file_content || '';
                    const normTerm = normalizeStr(searchTerm.trim());

                    const checkContentMatch = (filePath) => {
                      if (!folderContent || !normTerm) return false;
                      const h1 = `# Contenido: ${filePath}`;
                      const h2 = `[--- Archivo: ${filePath} ---]`;
                      let startIdx = folderContent.indexOf(h1);
                      if (startIdx === -1) startIdx = folderContent.indexOf(h2);
                      if (startIdx !== -1) {
                        let next1 = folderContent.indexOf('# Contenido:', startIdx + 10);
                        let next2 = folderContent.indexOf('[--- Archivo:', startIdx + 10);
                        let endIdx = folderContent.length;
                        if (next1 !== -1 && next2 !== -1) endIdx = Math.min(next1, next2);
                        else if (next1 !== -1) endIdx = next1;
                        else if (next2 !== -1) endIdx = next2;
                        const block = folderContent.slice(startIdx, endIdx);
                        return normalizeStr(block).includes(normTerm);
                      }
                      return false;
                    };

                    return data.files.map((f, i) => {
                      const isNameMatch = normTerm && normalizeStr(f.path).includes(normTerm);
                      const isContentMatch = normTerm && checkContentMatch(f.path);
                      
                      return (
                        <li key={i} className={`bg-white border ${isNameMatch || isContentMatch ? 'border-blue-400 bg-blue-50/40 shadow-blue-100/50' : 'border-slate-200'} rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm hover:border-blue-300 transition`}>
                          <span className="font-medium text-slate-700 break-all text-sm flex items-center flex-wrap gap-2">
                            📄 {f.path}
                            {isNameMatch && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                                📌 Nombre
                              </span>
                            )}
                            {isContentMatch && (
                              <span className="text-[10px] bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-bold">
                                🔎 Contenido
                              </span>
                            )}
                          </span>
                          <div className="flex gap-2 shrink-0">
                            <a href={f.url} target="_blank" rel="noreferrer" className="text-xs font-bold px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition">Ver en web</a>
                            <button onClick={() => forceDownload(f.url, f.name)} className="text-xs font-bold px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition shadow-sm">Bajar archivo</button>
                          </div>
                        </li>
                      );
                    });
                  } catch (e) { return <p>Error al abrir capeta estructural.</p> }
                })()}
              </ul>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl p-6 sm:p-8 animate-slide-up max-h-full overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">{editingId ? 'Editar Recurso' : 'Añadir Nuevo Recurso'}</h2>
              <button className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500" onClick={closeModal} disabled={isSubmitting || isFileReading}>✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="bg-slate-50 p-4 border border-dashed border-slate-300 rounded-xl">
                <div className="flex gap-2 mb-4 p-1 bg-slate-200/50 rounded-lg">
                  <button type="button" className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${!isFolderUpload ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => { setIsFolderUpload(false); setSelectedFile(null); }}>Archivo único</button>
                  <button type="button" className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${isFolderUpload ? 'bg-white shadow-sm text-amber-600' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => { setIsFolderUpload(true); setSelectedFile(null); }}>Carpeta o Directorio</button>
                </div>
                <div className="relative overflow-hidden w-full group">
                  {isFolderUpload ? (
                    <input type="file" id="folder-upload" className="absolute inset-0 opacity-0 cursor-pointer" webkitdirectory="" directory="" multiple onChange={handleFileChange} />
                  ) : (
                    <input type="file" id="file-upload" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileChange} />
                  )}
                  <div className="w-full py-4 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg flex items-center justify-center transition group-hover:border-blue-500 group-hover:text-blue-600 group-hover:bg-blue-50">
                    {isFileReading ? 'Analizando texto inteligente...' :
                      selectedFile ?
                        (isFolderUpload ? `📁 ${selectedFile.length} ficheros listos para subir` : `📎 ${selectedFile.name}`) :
                        (isFolderUpload ? 'Explorar Carpeta...' : 'Explorar un Archivo...')}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Título del Recurso</label>
                <input required type="text" name="title" value={formData.title} onChange={handleInputChange} placeholder="Ej. Manual de Identidad Visual" disabled={isSubmitting || isFileReading} className="input-field" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descripción <span className="opacity-50">(Opcional)</span></label>
                <textarea name="description" value={formData.description} onChange={handleInputChange} placeholder="Detalles extra..." rows="2" disabled={isSubmitting || isFileReading} className="input-field"></textarea>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Categoría</label>
                  <select name="category" value={formData.category} onChange={handleInputChange} disabled={isSubmitting || isFileReading} className="input-field">
                    {categories.filter(c => c !== 'Todos').map(c => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo Identificativo</label>
                  <select name="type" value={formData.type} onChange={handleInputChange} disabled={isSubmitting || isFileReading} className="input-field">
                    <option value="folder">Carpeta (Directorio)</option>
                    <option value="pdf">Documento PDF</option>
                    <option value="doc">Documento Word</option>
                    <option value="sheet">Excel / CSV</option>
                    <option value="ppt">Presentación</option>
                    <option value="link">Enlace o Foto</option>
                  </select>
                </div>
              </div>


              {uploadProgress && (
                <div className="text-center font-bold text-amber-600 bg-amber-50 py-2 rounded-lg text-sm animate-pulse">
                  {uploadProgress}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                <button type="button" className="btn-secondary" onClick={closeModal} disabled={isSubmitting || isFileReading}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={isSubmitting || isFileReading}>
                  {isSubmitting ? 'Subiendo a la nube...' : (editingId ? 'Guardar Cambios' : 'Subir y Anexar')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

export default App;
