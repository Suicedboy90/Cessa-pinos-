import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, writeBatch, serverTimestamp, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { LogEntry, Medication } from '../types';
import { Plus, Loader2, Download, Trash2 } from 'lucide-react';
import Modal from './Modal';
import * as xlsx from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDateWithMonthName } from '../lib/utils';

export default function LogBook() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nextFolio, setNextFolio] = useState('');

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
    const qLogs = query(collection(db, 'logs'), orderBy('createdAt', 'desc'), limit(50));
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

    const now = new Date().toISOString().split('T')[0];
    setFechaEgreso(now);
    setFechaIngreso('');
    
    const mNombre = localStorage.getItem('lastNombreMedico');
    const mCed = localStorage.getItem('lastCedulaProfesional');
    const mDom = localStorage.getItem('lastDomicilio');
    if (mNombre) setNombreMedico(mNombre);
    if (mCed) setCedulaProfesional(mCed);
    if (mDom) setDomicilio(mDom);
    
    return () => {
      unsubLogs();
      unsubMeds();
    };
  }, []);

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
        stock_actual: selectedMed.stock_actual - amt,
        updatedAt: serverTimestamp()
      });
      
      await batch.commit();
      
      setIsModalOpen(false);
      
      // Reset defaults
      setFolio('');
      setSelectedMed(null);
      setMedSearch('');
      setCantidad('1');
      setPaciente('');
      // Don't reset physician info
      localStorage.setItem('lastNombreMedico', nombreMedico);
      localStorage.setItem('lastCedulaProfesional', cedulaProfesional);
      localStorage.setItem('lastDomicilio', domicilio);
    } catch (error) {
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

  const toggleAllSelection = () => {
    if (selectedLogs.size === logs.length && logs.length > 0) {
      setSelectedLogs(new Set());
    } else {
      setSelectedLogs(new Set(logs.map(l => l.id)));
    }
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
        const med = medications.find(m => m.id === medId);
        if (med) {
          batch.update(doc(db, 'medications', medId), {
            stock_actual: med.stock_actual + amount,
            updatedAt: serverTimestamp()
          });
        }
      }
      
      await batch.commit();
      setSelectedLogs(new Set());
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'logs');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportExcel = () => {
    const dataToExport = logs.map(l => {
      const med = medications.find(m => m.id === l.medicationId);
      const dGenerica = med ? `${med.nombre}${med.descripcion ? ` - ${med.descripcion}` : ''}` : (l.denominacionGenerica || '-');
      const pres = med ? med.presentacion : (l.presentacion || '-');
      
      let fechas = ``;
      if (l.fechaIngreso) fechas += `Ing: ${formatDateWithMonthName(l.fechaIngreso)}\n`;
      fechas += `Egr: ${formatDateWithMonthName(l.fechaEgreso)}`;

      let medicoStr = l.nombreMedico || '-';
      if (l.cedulaProfesional) medicoStr += `\nCéd: ${l.cedulaProfesional}`;

      return {
        'Núm.': l.folio,
        'Fechas': fechas,
        'Clave': med ? med.clave : '-',
        'D. Genérica': dGenerica,
        'Presentación': pres,
        'Cant.': `-${l.cantidad}`,
        'Paciente': l.paciente || '-',
        'Médico': medicoStr,
        'Domicilio': l.domicilio || '-'
      };
    });

    const worksheet = xlsx.utils.json_to_sheet(dataToExport);
    
    // Auto-fit columns
    if (dataToExport.length > 0) {
      const wscols = Object.keys(dataToExport[0]).map(key => {
        const maxLength = Math.max(
          key.length,
          ...dataToExport.map(row => String(row[key as keyof typeof row] || '').length)
        );
        return { wch: Math.min(maxLength + 2, 100) }; // Cap at 100 characters width
      });
      worksheet['!cols'] = wscols;
    }

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Bitácora');
    xlsx.writeFile(workbook, 'Bitacora_Salidas.xlsx');
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    
    doc.text('Historial de Salidas de Medicamentos', 14, 15);
    
    const tableData = logs.map(l => {
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
      startY: 20,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });

    doc.save('Bitacora_Salidas.pdf');
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
            onClick={handleExportExcel}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700"
          >
            <Download className="w-4 h-4 mr-2" />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
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

      <div className="overflow-hidden border border-gray-200 sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left w-12">
                  <input 
                    type="checkbox" 
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={logs.length > 0 && selectedLogs.size === logs.length}
                    onChange={toggleAllSelection}
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Núm.</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fechas</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clave</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">D. Genérica</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Presentación</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cant.</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paciente</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Médico</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Domicilio</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-gray-500 text-sm">
                    No hay registros de salidas.
                  </td>
                </tr>
              ) : (
                logs.map((l) => {
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
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                        {l.folio}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 w-48">
                        <div><span className="font-medium text-gray-900">Ing:</span> {l.fechaIngreso ? formatDateWithMonthName(l.fechaIngreso) : '-'}</div>
                        <div><span className="font-medium text-gray-900">Egr:</span> {formatDateWithMonthName(l.fechaEgreso)}</div>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-gray-900">
                        {med ? med.clave : '-'}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 font-medium">
                        {dGenerica}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {pres}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-bold text-red-600">
                        -{l.cantidad}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        {l.paciente || '-'}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        <div>{l.nombreMedico || '-'}</div>
                        <div className="text-gray-500 text-xs">{l.cedulaProfesional}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500 max-w-[200px] truncate" title={l.domicilio}>
                        {l.domicilio || '-'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
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
               <option value="Crónico">Crónico</option>
               <option value="General">General</option>
             </select>
          </div>

          <div className="border-t pt-4">
             <h4 className="text-sm font-medium text-gray-900 mb-2">Información del Médico</h4>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div>
                  <label className="block text-sm font-medium text-gray-700">Nombre del Médico</label>
                  <input 
                    type="text" required
                    value={nombreMedico} onChange={e => setNombreMedico(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                  />
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700">Cédula Profesional</label>
                  <input 
                    type="text" required
                    value={cedulaProfesional} onChange={e => setCedulaProfesional(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                  />
               </div>
             </div>
             <div className="mt-2">
                <label className="block text-sm font-medium text-gray-700">Domicilio</label>
                <input 
                  type="text" required
                  value={domicilio} onChange={e => setDomicilio(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
                />
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
