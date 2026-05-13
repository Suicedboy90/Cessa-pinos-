import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medication } from '../types';
import { Plus, Download, AlertTriangle, Edit2, Loader2, Search } from 'lucide-react';
import * as xlsx from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import Modal from './Modal';
import { cn, formatDateWithMonthName, getLocalDateString } from '../lib/utils';

export default function Inventory() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>('all');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  
  // Form State
  const [num, setNum] = useState('');
  const [clave, setClave] = useState('');
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [presentacion, setPresentacion] = useState('');
  const [stock, setStock] = useState('0');
  const [existenciaPasado, setExistenciaPasado] = useState('0');
  const [fechaExistenciaPasado, setFechaExistenciaPasado] = useState('');
  const [surtido, setSurtido] = useState('0');
  const [fechaSurtido, setFechaSurtido] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'medications'), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const meds: Medication[] = [];
      snapshot.forEach((d) => {
        meds.push({ id: d.id, ...d.data() } as Medication);
      });
      setMedications(meds);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'medications');
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const lowStockMeds = medications.filter(m => m.stock_actual <= 5);
  
  // All available months in the data
  const availableMonths = Array.from(new Set(medications.map(m => {
    const date = m.updatedAt?.toDate ? m.updatedAt.toDate() : new Date();
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

  const filteredMeds = medications.filter(m => {
    const matchesSearch = m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         m.clave.includes(searchTerm);
    
    if (selectedMonthFilter === 'all') return matchesSearch;
    
    const medMonth = (m.updatedAt?.toDate ? m.updatedAt.toDate() : new Date()).toLocaleString('es-MX', { month: 'long', year: 'numeric' });
    return matchesSearch && medMonth === selectedMonthFilter;
  });

  const groupedMeds = filteredMeds.reduce((acc, curr) => {
    const date = curr.updatedAt?.toDate ? curr.updatedAt.toDate() : new Date();
    const monthYear = date.toLocaleString('es-MX', { month: 'long', year: 'numeric' });
    if (!acc[monthYear]) acc[monthYear] = [];
    acc[monthYear].push(curr);
    return acc;
  }, {} as Record<string, Medication[]>);

  const monthOrder = Object.keys(groupedMeds).sort((a, b) => {
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

  const handleExportInventoryExcel = () => {
    const dataToExport = filteredMeds.map(m => ({
      'Núm': m.num,
      'Clave': m.clave,
      'Nombre': m.nombre,
      'Descripción': m.descripcion || '',
      'Presentación': m.presentacion,
      'Ex. Mes Pasado': m.existencia_mes_pasado || 0,
      'Fecha Ex. Pasado': m.fecha_existencia_mes_pasado ? formatDateWithMonthName(m.fecha_existencia_mes_pasado) : '',
      'Surtido': m.surtido || 0,
      'Fecha Surtido': m.fecha_surtido ? formatDateWithMonthName(m.fecha_surtido) : '',
      'Stock Físico (Final)': m.stock_actual
    }));

    const worksheet = xlsx.utils.json_to_sheet(dataToExport);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Inventario');
    
    // Auto-fit columns
    const wscols = Object.keys(dataToExport[0] || {}).map(key => ({
      wch: Math.min(Math.max(key.length, ...dataToExport.map(row => String(row[key as keyof typeof row] || '').length)), 50) + 2
    }));
    worksheet['!cols'] = wscols;

    xlsx.writeFile(workbook, `Inventario_Farmacia_${getLocalDateString()}.xlsx`);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.text('Inventario de Medicamentos - Botica CESSA Pinos', pageWidth / 2, 15, { align: 'center' });
    
    doc.setFontSize(11);
    doc.text(`Reporte de Existencias (${formatDateWithMonthName(getLocalDateString())})`, pageWidth / 2, 22, { align: 'center' });

    const tableData = filteredMeds.map(m => [
      m.num,
      m.clave,
      m.nombre,
      m.presentacion,
      m.existencia_mes_pasado || 0,
      m.surtido || 0,
      m.stock_actual,
      m.descripcion || '-'
    ]);

    autoTable(doc, {
      startY: 30,
      head: [['Num', 'Clave', 'Medicamento', 'Pres.', 'Ex. Pasada', 'Surtido', 'Stock Final', 'Descripción']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      styles: { fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 35 },
        2: { cellWidth: 50 },
        3: { cellWidth: 30 },
        4: { cellWidth: 20 },
        5: { cellWidth: 20 },
        6: { cellWidth: 20 },
        7: { cellWidth: 'auto' }
      }
    });

    doc.save(`Inventario_Farmacia_${getLocalDateString()}.pdf`);
  };

  const resetForm = () => {
    setNum('');
    setClave('');
    setNombre('');
    setDescripcion('');
    setPresentacion('');
    setStock('0');
    setExistenciaPasado('0');
    setFechaExistenciaPasado('');
    setSurtido('0');
    setFechaSurtido('');
    setEditingMed(null);
  };

  const openEdit = (m: Medication) => {
    setEditingMed(m);
    setNum(m.num.toString());
    setClave(m.clave);
    setNombre(m.nombre);
    setDescripcion(m.descripcion);
    setPresentacion(m.presentacion);
    setStock(m.stock_actual.toString());
    setExistenciaPasado((m.existencia_mes_pasado || 0).toString());
    setFechaExistenciaPasado(m.fecha_existencia_mes_pasado || '');
    setSurtido((m.surtido || 0).toString());
    setFechaSurtido(m.fecha_surtido || '');
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      if (editingMed) {
        const ref = doc(db, 'medications', editingMed.id);
        await updateDoc(ref, {
          num: parseInt(num, 10),
          clave,
          nombre,
          descripcion,
          presentacion,
          stock_actual: parseInt(stock, 10),
          existencia_mes_pasado: parseInt(existenciaPasado, 10),
          fecha_existencia_mes_pasado: fechaExistenciaPasado || null,
          surtido: parseInt(surtido, 10),
          fecha_surtido: fechaSurtido || null,
          updatedAt: serverTimestamp()
        });
      } else {
        const newId = doc(collection(db, 'medications')).id;
        
        await setDoc(doc(db, 'medications', newId), {
          num: parseInt(num, 10),
          clave,
          nombre,
          descripcion,
          presentacion,
          stock_actual: parseInt(stock, 10),
          existencia_mes_pasado: parseInt(existenciaPasado, 10),
          fecha_existencia_mes_pasado: fechaExistenciaPasado || null,
          surtido: parseInt(surtido, 10),
          fecha_surtido: fechaSurtido || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      
      setIsModalOpen(false);
      resetForm();
    } catch (err: any) {
      console.error('Error saving medication:', err);
      let message = 'Error al guardar el medicamento. Por favor intente de nuevo.';
      
      if (err.message && err.message.includes('quota')) {
        message = 'Se ha excedido la cuota gratuita de Firebase (Plan Spark). El registro se guardará localmente.';
      } else if (err.message && err.message.includes('permission')) {
        message = 'Error de permisos: No tiene autorización.';
      } else if (err.message) {
        try {
          const parsed = JSON.parse(err.message);
          if (parsed.error) message = `Error: ${parsed.error}`;
        } catch {
          message = err.message;
        }
      }
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="space-y-6">
      {lowStockMeds.length > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-800">Alerta de Stock Bajo</h3>
            <p className="text-sm text-red-700 mt-1">
              Hay {lowStockMeds.length} medicamento(s) con stock crítico (5 unidades o menos).
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-white p-4 rounded-lg border border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:flex-1">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg shadow-sm bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
              placeholder="Buscar por clave o nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="w-full sm:w-56">
            <select
              value={selectedMonthFilter}
              onChange={(e) => setSelectedMonthFilter(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white text-base outline-none cursor-pointer"
            >
              <option value="all">Modificados (Todo)</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleExportInventoryExcel}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-green-300 shadow-sm text-sm font-medium rounded-lg text-green-700 bg-green-50 hover:bg-green-100"
          >
            <Download className="w-4 h-4 mr-2" />
            Inventario Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="w-4 h-4 mr-2 text-red-600" />
            Inventario PDF
          </button>
          <button
            onClick={() => { 
              resetForm(); 
              const maxN = medications.length > 0 ? Math.max(...medications.map(m => m.num)) : 0;
              setNum((maxN + 1).toString());
              setIsModalOpen(true); 
            }}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo
          </button>
        </div>
      </div>

      <div className="overflow-hidden border border-gray-200 sm:rounded-lg bg-white">
        <div className="overflow-x-auto">
          {filteredMeds.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">
              No se encontraron medicamentos.
            </div>
          ) : (
            <div className="space-y-6">
              {monthOrder.map((month) => (
                <div key={month} className="border-b border-gray-100 last:border-0">
                  <div className="bg-gray-50 px-6 py-3 flex justify-between items-center sticky top-0 z-10 border-y border-gray-200">
                    <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                      Modificados en {month}
                    </span>
                  </div>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-white">
                      <tr>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Núm.</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Clave</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Medicamento</th>
                        <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Presentación</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Ex. Pasado</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Surtido</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Stock Físico</th>
                        <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {groupedMeds[month].map((m) => (
                        <tr key={m.id} className={cn(m.stock_actual <= 5 ? "bg-red-50/30" : "", "hover:bg-gray-50 transition-colors")}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-100">
                            {m.num}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 font-bold">
                            {m.clave}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900 w-1/4">
                            <div className="font-bold text-gray-900">{m.nombre}</div>
                            {m.descripcion && <div className="text-gray-500 text-xs mt-1 italic leading-tight">{m.descripcion}</div>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                            {m.presentacion}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                            <div>{m.existencia_mes_pasado || 0}</div>
                            {m.fecha_existencia_mes_pasado && <div className="text-[10px] text-gray-400 mt-1">{formatDateWithMonthName(m.fecha_existencia_mes_pasado)}</div>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-green-600 font-bold bg-green-50/20">
                            <div>+{m.surtido || 0}</div>
                            {m.fecha_surtido && <div className="text-[10px] text-gray-400 mt-1">{formatDateWithMonthName(m.fecha_surtido)}</div>}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-right">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black",
                              m.stock_actual <= 5 ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                            )}>
                              {m.stock_actual}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button 
                              onClick={() => openEdit(m)}
                              className="text-blue-600 hover:text-blue-900 focus:outline-none transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false);
          setError(null);
        }}
        title={editingMed ? "Editar Medicamento" : "Nuevo Medicamento"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Núm. Autoincremental</label>
              <input 
                type="number" required 
                value={num} onChange={e => setNum(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-gray-50" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Clave</label>
              <input 
                type="text" required 
                placeholder="Ej: 010.000.0101.00"
                value={clave} onChange={e => setClave(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre</label>
            <input 
              type="text" required 
              value={nombre} onChange={e => setNombre(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Descripción</label>
            <textarea 
              rows={2}
              value={descripcion} onChange={e => setDescripcion(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Presentación</label>
            <input 
              type="text" 
              value={presentacion} onChange={e => setPresentacion(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
            />
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border p-3 rounded-md bg-gray-50">
            <div>
              <label className="block text-sm font-medium text-gray-700">Existencia Mes Pasado</label>
              <input 
                type="number" min="0" required
                value={existenciaPasado} onChange={e => setExistenciaPasado(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Fecha Existencia</label>
              <input 
                type="date"
                value={fechaExistenciaPasado} onChange={e => setFechaExistenciaPasado(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white" 
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border p-3 rounded-md bg-blue-50/50">
            <div>
              <label className="block text-sm font-medium text-gray-700">Surtido (Entradas)</label>
              <input 
                type="number" min="0" required
                value={surtido} onChange={e => setSurtido(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Fecha de Surtido</label>
              <input 
                type="date"
                value={fechaSurtido} onChange={e => setFechaSurtido(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border bg-white" 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Stock Actual (Físico/Calculado)</label>
            <input 
              type="number" min="0" required
              value={stock} onChange={e => setStock(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border" 
            />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Guardar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
