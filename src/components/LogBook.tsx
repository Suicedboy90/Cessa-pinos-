import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { LogEntry, Medication } from '../types';
import { Plus, Loader2, Download, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateWithMonthName, parseLocalDate, getLocalDateString } from '../lib/utils';
import { PATIENT_TYPES } from '../constants';

export default function LogBook() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all');
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nextFolio, setNextFolio] = useState('');

  // All available months in the data
  const availableMonths = Array.from(new Set(logs.map(l => {
    const date = parseLocalDate(l.fechaEgreso);
    return date.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
  }))).sort((a, b) => {
    const [monthA, yearA] = a.toLowerCase().split(' ');
    const [monthB, yearB] = b.toLowerCase().split(' ');
    const meses: Record<string, number> = {
      'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
      'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
    };
    const dateA = new Date(parseInt(yearA), meses[monthA] ?? 0, 1);
    const dateB = new Date(parseInt(yearB), meses[monthB] ?? 0, 1);
    return dateB.getTime() - dateA.getTime();
  });

  const filteredLogs = logs.filter(l => {
    const med = medications.find(m => m.id === l.medicationId);
    const matchesSearch = 
      (l.paciente || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.folio || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (med && (med.nombre || '').toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.denominacionGenerica || '').toLowerCase().includes(searchTerm.toLowerCase());
    
    if (selectedMonthFilter === 'all') return matchesSearch;
    
    const dateValue = l.fechaEgreso ? parseLocalDate(l.fechaEgreso) : new Date();
    const logMonth = dateValue.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
    return matchesSearch && logMonth === selectedMonthFilter;
  });

  // Group logs by month for the UI
  const groupedLogs = filteredLogs.reduce((acc, curr) => {
    const date = parseLocalDate(curr.fechaEgreso);
    const monthYear = date.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(curr);
    return acc;
  }, {} as Record<string, LogEntry[]>);

  const monthOrder = Object.keys(groupedLogs).sort((a, b) => {
    const [monthA, yearA] = a.toLowerCase().split(' ');
    const [monthB, yearB] = b.toLowerCase().split(' ');
    const meses: Record<string, number> = {
      'enero': 0, 'febrero': 1, 'marzo': 2, 'abril': 3, 'mayo': 4, 'junio': 5,
      'julio': 6, 'agosto': 7, 'septiembre': 8, 'octubre': 9, 'noviembre': 10, 'diciembre': 11
    };
    const dateA = new Date(parseInt(yearA), meses[monthA] ?? 0, 1);
    const dateB = new Date(parseInt(yearB), meses[monthB] ?? 0, 1);
    return dateB.getTime() - dateA.getTime();
  });

  // Form State
  const [folio, setFolio] = useState('');
  const [medSearch, setMedSearch] = useState('');
  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);
  
  const [fechaIngreso, setFechaIngreso] = useState('');
  const [fechaEgreso, setFechaEgreso] = useState('');
  
  const [denominacionDistinta, setDenominacionDistinta] = useState('');
  const [denominacionGenerica, setDenominacionGenerica] = useState('');
  const [presentacion, setPresentacion] = useState('');
  
  const [cantidad, setCantidad] = useState('1');
  const [nombreMedico, setNombreMedico] = useState('');
  const [cedulaProfesional, setCedulaProfesional] = useState('');
  const [domicilio, setDomicilio] = useState('');
  const [paciente, setPaciente] = useState('');

  useEffect(() => {
    const qLogs = query(collection(db, 'logs'), orderBy('fechaEgreso', 'desc'), orderBy('createdAt', 'desc'));
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      const parsedLogs: LogEntry[] = [];
      snapshot.forEach(d => parsedLogs.push({ id: d.id, ...d.data() } as LogEntry));
      setLogs(parsedLogs);
      
      // Attempt to calc next folio
      if (parsedLogs.length > 0) {
        // Very basic simple auto-increment suggestion based on last string
        const lastFolioNum = parseInt(parsedLogs[0].folio.replace(/\D/g, ''), 10);
        if (!isNaN(lastFolioNum)) {
          setNextFolio((lastFolioNum + 1).toString());
        } else {
          setNextFolio('1');
        }
      } else {
        setNextFolio('1');
      }
      
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'logs'));

    const qMeds = query(collection(db, 'medications'));
    const unsubMeds = onSnapshot(qMeds, (snapshot) => {
      const parsedMeds: Medication[] = [];
      snapshot.forEach(d => parsedMeds.push({ id: d.id, ...d.data() } as Medication));
      setMedications(parsedMeds);
    });

    const now = getLocalDateString();
    setFechaEgreso(now);
    setFechaIngreso('');
    
    return () => {
      unsubLogs();
      unsubMeds();
    };
  }, []);

  const uniqueDoctors = Array.from(new Set(logs.map(l => l.nombreMedico).filter(Boolean)));
  const uniqueCedulas = Array.from(new Set(logs.map(l => l.cedulaProfesional).filter(Boolean)));
  const uniqueDomicilios = Array.from(new Set(logs.map(l => l.domicilio).filter(Boolean)));

  const handleMedSelect = (med: Medication) => {
    setSelectedMed(med);
    setMedSearch(med.nombre);
    setDenominacionGenerica(med.descripcion ? `${med.nombre} - ${med.descripcion}` : med.nombre);
    setPresentacion(med.presentacion);
    setDenominacionDistinta(med.descripcion);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMed) return alert("Seleccione un medicamento válido");
    if (parseInt(cantidad, 10) > selectedMed.stock_actual) {
      return alert("El stock actual es menor a la cantidad a retirar.");
    }
    
    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      
      const newLogRef = doc(collection(db, 'logs'));
      const amt = parseInt(cantidad, 10);
      
      batch.set(newLogRef, {
        folio: folio || nextFolio,
        fechaIngreso,
        fechaEgreso,
        denominacionDistinta,
        denominacionGenerica,
        presentacion,
        cantidad: amt,
        nombreMedico,
        cedulaProfesional,
        domicilio,
        paciente,
        medicationId: selectedMed.id,
        createdAt: serverTimestamp()
      });
      
      const medRef = doc(db, 'medications', selectedMed.id);
      batch.update(medRef, {
        stock_actual: increment(-amt),
        updatedAt: serverTimestamp()
      });
      
      await batch.commit();
      
      // Cleanup on success
      setIsModalOpen(false);
      
      // Reset defaults
      setFolio('');
      setSelectedMed(null);
      setMedSearch('');
      setCantidad('1');
      setPaciente('');
      
      // Don't reset physician info, but update storage
      localStorage.setItem('lastNombreMedico', nombreMedico);
      localStorage.setItem('lastCedulaProfesional', cedulaProfesional);
      localStorage.setItem('lastDomicilio', domicilio);
    } catch (error) {
      console.error('Error saving log entry:', error);
      handleFirestoreError(error, OperationType.WRITE, 'logs');
    } finally {
      setIsSaving(false);
    }
  };

  // Autocomplete filtering
  const searchResults = medSearch && !selectedMed 
    ? medications.filter(m => m.nombre.toLowerCase().includes(medSearch.toLowerCase()) || m.clave.includes(medSearch)).slice(0, 5)
    : [];

  const toggleSelection = (logId: string) => {
    const newSelection = new Set(selectedLogs);
    if (newSelection.has(logId)) {
      newSelection.delete(logId);
    } else {
      newSelection.add(logId);
    }
    setSelectedLogs(newSelection);
  };

  const handleDeleteSelected = async () => {
    if (selectedLogs.size === 0) return;
    if (!window.confirm(`¿Estás seguro de que deseas eliminar ${selectedLogs.size} registro(s)? Stock actual se revertirá.`)) return;
    
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      
      const selectedLogsData = logs.filter(l => selectedLogs.has(l.id));
      
      // Keep track of stock refunds
      const refunds: Record<string, number> = {};
      
      selectedLogsData.forEach(l => {
        // Delete log entry
        batch.delete(doc(db, 'logs', l.id));
        
        // Add to refunds
        if (!refunds[l.medicationId]) refunds[l.medicationId] = 0;
        refunds[l.medicationId] += l.cantidad;
      });
      
      // Update medication stocks
      for (const [medId, amount] of Object.entries(refunds)) {
        batch.update(doc(db, 'medications', medId), {
          stock_actual: increment(amount),
          updatedAt: serverTimestamp()
        });
      }
      
      await batch.commit();
      setSelectedLogs(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'logs');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportPDF = (monthYear?: string | React.MouseEvent) => {
    const monthYearStr = typeof monthYear === 'string' ? monthYear : undefined;
    const doc = new jsPDF({ orientation: 'landscape' });
    const logsToExport = monthYearStr ? groupedLogs[monthYearStr] : filteredLogs;

    if (!logsToExport) return;
    
    doc.setFontSize(16);
    doc.text(`Historial de Salidas - ${monthYearStr || 'Total'}`, 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Generado el: ${formatDateWithMonthName(getLocalDateString())}`, 14, 22);
    
    const tableData = logsToExport.map(l => {
      const med = medications.find(m => m.id === l.medicationId);
      const dGenerica = med ? `${med.nombre}${med.descripcion ? ` - ${med.descripcion}` : ''}` : (l.denominacionGenerica || '-');
      const pres = med ? med.presentacion : (l.presentacion || '-');
      
      let fechas = ``;
      if (l.fechaIngreso) fechas += `Ing: ${formatDateWithMonthName(l.fechaIngreso)}\n`;
      fechas += `Egr: ${formatDateWithMonthName(l.fechaEgreso)}`;

      let medicoStr = l.nombreMedico || '-';
      if (l.cedulaProfesional) medicoStr += `\nCéd: ${l.cedulaProfesional}`;

      return [
        l.folio,
        fechas,
        med ? med.clave : '-',
        dGenerica,
        pres,
        `-${l.cantidad}`,
        l.paciente || '-',
        medicoStr,
        l.domicilio || '-'
      ];
    });

    autoTable(doc, {
      head: [['Núm.', 'Fechas', 'Clave', 'D. Genérica', 'Presentación', 'Cant.', 'Paciente', 'Médico', 'Domicilio']],
      body: tableData,
      startY: 28,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save(`Bitacora_Salidas_${monthYearStr ? monthYearStr.replace(' ', '_') : 'Total'}.pdf`);
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h2 className="text-lg font-medium text-gray-900">Historial de Salidas</h2>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {selectedLogs.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={isDeleting}
              className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Eliminar ({selectedLogs.size})
            </button>
          )}
          <button
            onClick={() => handleExportPDF(selectedMonthFilter !== 'all' ? selectedMonthFilter : undefined)}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700"
          >
            <Download className="w-4 h-4 mr-2" />
            PDF
          </button>
          <button
            onClick={() => { setFolio(nextFolio); setIsModalOpen(true); }}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Registrar Salida
          </button>
        </div>
      </div>

      <div className="overflow-hidden border border-gray-200 sm:rounded-lg bg-white">
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Buscar por paciente, folio o medicamento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm"
            />
          </div>
          <div className="w-full sm:w-48">
            <select
              value={selectedMonthFilter}
              onChange={(e) => setSelectedMonthFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm outline-none"
            >
              <option value="all">Todos los meses</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-center text-gray-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            Cargando registros...
          </div>
        ) : logs.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            No hay registros de salidas.
          </div>
        ) : (
          <div className="space-y-6">
            {monthOrder.map((month) => (
              <div key={month} className="border-b border-gray-100 last:border-0">
                <div className="bg-gray-50 px-6 py-3 flex justify-between items-center sticky top-0 z-10 border-y border-gray-200">
                  <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                    {month}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-white">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left w-12">
                          <input 
                            type="checkbox" 
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            checked={groupedLogs[month].every(l => selectedLogs.has(l.id))}
                            onChange={() => {
                              const newSelection = new Set(selectedLogs);
                              const monthIds = groupedLogs[month].map(l => l.id);
                              const allSelected = monthIds.every(id => newSelection.has(id));
                              
                              monthIds.forEach(id => {
                                if (allSelected) newSelection.delete(id);
                                else newSelection.add(id);
                              });
                              setSelectedLogs(newSelection);
                            }}
                          />
                        </th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Núm.</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Fechas</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Clave</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">D. Genérica</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Presentación</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Cant.</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Paciente</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Médico</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {groupedLogs[month].map((l) => {
                        const med = medications.find(m => m.id === l.medicationId);
                        const dGenerica = med ? `${med.nombre}${med.descripcion ? ` - ${med.descripcion}` : ''}` : (l.denominacionGenerica || '-');
                        const pres = med ? med.presentacion : (l.presentacion || '-');
                        return (
                          <tr key={l.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-4 w-12">
                              <input 
                                type="checkbox" 
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                checked={selectedLogs.has(l.id)}
                                onChange={() => toggleSelection(l.id)}
                              />
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                              {l.folio}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-500 w-48 font-medium">
                              {l.fechaIngreso && <div><span className="text-gray-400">Ing:</span> {formatDateWithMonthName(l.fechaIngreso)}</div>}
                              <div><span className="text-blue-400">Egr:</span> {formatDateWithMonthName(l.fechaEgreso)}</div>
                            </td>
                            <td className="px-4 py-4 text-sm font-bold text-gray-900 bg-gray-50/30">
                              {med ? med.clave : '-'}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900 font-medium">
                              {dGenerica}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-500">
                              {pres}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-black text-red-600">
                              -{l.cantidad}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-900 font-medium capitalize">
                              {l.paciente || '-'}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600">
                              <div className="font-medium text-gray-900">{l.nombreMedico || '-'}</div>
                              {l.cedulaProfesional && <div className="text-[10px] text-gray-400">Céd: {l.cedulaProfesional}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Nueva Salida"
      >
        <form onSubmit={handleSave} className="space-y-4">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-b pb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Núm. Consecutivo (Sugerido: {nextFolio})</label>
              <input 
                type="text" required 
                value={folio} onChange={e => setFolio(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-gray-50" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Cantidad</label>
              <input 
                type="number" min="1" required 
                value={cantidad} onChange={e => setCantidad(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
              />
            </div>
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700">Buscar Medicamento (Nombre o Clave)</label>
            <input 
              type="text" required 
              value={medSearch} 
              onChange={e => {
                setMedSearch(e.target.value);
                setSelectedMed(null); // Clear selected med if user types
              }}
              placeholder="Escriba para buscar..."
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto sm:text-sm">
                {searchResults.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleMedSelect(m)}
                    className="w-full text-left cursor-default select-none relative py-2 pl-3 pr-9 hover:bg-blue-50"
                  >
                    <span className="block truncate font-medium">{m.clave} - {m.nombre}</span>
                    <span className="block truncate text-gray-500 text-xs">Stock: {m.stock_actual} | {m.presentacion}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedMed && (
               <div className="mt-2 text-xs text-green-600 bg-green-50 p-2 rounded flex justify-between">
                 <span>Medicamento seleccionado válido.</span>
                 <span className="font-bold">Stock disp: {selectedMed.stock_actual}</span>
               </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Denominación Genérica</label>
              <input 
                type="text" 
                value={denominacionGenerica} onChange={e => setDenominacionGenerica(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-gray-50" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Presentación</label>
              <input 
                type="text" 
                value={presentacion} onChange={e => setPresentacion(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-gray-50" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Fecha Ingreso (Opcional)</label>
              <input 
                type="date"
                value={fechaIngreso} onChange={e => setFechaIngreso(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Fecha Egreso</label>
              <input 
                type="date" required
                value={fechaEgreso} onChange={e => setFechaEgreso(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
              />
            </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700">Dirigido a Paciente (Tipo)</label>
             <select
               value={paciente} 
               onChange={e => setPaciente(e.target.value)}
               className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-white border"
             >
               <option value="">Seleccione el tipo de paciente</option>
               {PATIENT_TYPES.map(type => (
                 <option key={type} value={type}>{type}</option>
               ))}
             </select>
          </div>

          <div className="border-t pt-4">
             <h4 className="text-sm font-medium text-gray-900 mb-2">Información del Médico</h4>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                  <label className="block text-sm font-medium text-gray-700">Nombre del Médico</label>
                  <input 
                    type="text" required
                    list="doctors-list"
                    value={nombreMedico} onChange={e => setNombreMedico(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                  />
                  <datalist id="doctors-list">
                    {uniqueDoctors.map(d => <option key={d} value={d} />)}
                  </datalist>
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700">Cédula Profesional</label>
                  <input 
                    type="text" required
                    list="cedula-list"
                    value={cedulaProfesional} onChange={e => setCedulaProfesional(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                  />
                  <datalist id="cedula-list">
                    {uniqueCedulas.map(c => <option key={c} value={c} />)}
                  </datalist>
               </div>
             </div>
             <div className="mt-2">
                <label className="block text-sm font-medium text-gray-700">Domicilio</label>
                <input 
                  type="text" required
                  list="domicilio-list"
                  value={domicilio} onChange={e => setDomicilio(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                />
                <datalist id="domicilio-list">
                   {uniqueDomicilios.map(d => <option key={d} value={d} />)}
                </datalist>
             </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || !selectedMed}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar Salida
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
