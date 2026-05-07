import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { Medication } from '../types';
import { Plus, Download, AlertTriangle, Edit2, Loader2, Search } from 'lucide-react';
import * as xlsx from 'xlsx';
import Modal from './Modal';
import { cn, formatDateWithMonthName } from '../lib/utils';

export default function Inventory() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
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

  useEffect(() => {
    const q = query(collection(db, 'medications'), orderBy('num', 'desc'));
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

    return () => unsubscribe();
  }, []);

  const lowStockMeds = medications.filter(m => m.stock_actual <= 5);
  const filteredMeds = medications.filter(m => 
    m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.clave.includes(searchTerm)
  );

  const handleExportExcel = () => {
    const dataToExport = medications.map(m => ({
      'Núm': m.num,
      'Clave': m.clave,
      'Nombre': m.nombre,
      'Descripción': m.descripcion,
      'Presentación': m.presentacion,
      'Ex. Mes Pasado': m.existencia_mes_pasado || 0,
      'Fecha Ex. Pasado': formatDateWithMonthName(m.fecha_existencia_mes_pasado),
      'Surtido': m.surtido || 0,
      'Fecha Surtido': formatDateWithMonthName(m.fecha_surtido),
      'Stock Físico (Final)': m.stock_actual
    }));
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
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Inventario');
    xlsx.writeFile(workbook, 'Inventario_Farmacia.xlsx');
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
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'medications');
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

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            placeholder="Buscar por clave o nombre..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={handleExportExcel}
            className="flex-1 sm:flex-none inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="w-4 h-4 mr-2" />
            Exportar XLS
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

      <div className="overflow-hidden border border-gray-200 sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Núm.</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clave</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Medicamento</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Presentación</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ex. Pasado</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Surtido</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Físico</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredMeds.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500 text-sm">
                    No se encontraron medicamentos.
                  </td>
                </tr>
              ) : (
                filteredMeds.map((m) => (
                  <tr key={m.id} className={m.stock_actual <= 5 ? "bg-red-50/30" : ""}>
                    <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {m.num}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                      {m.clave}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900 w-1/4">
                      <div className="font-medium text-blue-700">{m.nombre}</div>
                      {m.descripcion && <div className="text-gray-500 text-xs mt-1 italic">{m.descripcion}</div>}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {m.presentacion}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-gray-500">
                      <div>{m.existencia_mes_pasado || 0}</div>
                      {m.fecha_existencia_mes_pasado && <div className="text-[10px] text-gray-400 mt-1">{formatDateWithMonthName(m.fecha_existencia_mes_pasado)}</div>}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                      <div>+{m.surtido || 0}</div>
                      {m.fecha_surtido && <div className="text-[10px] text-gray-400 mt-1">{formatDateWithMonthName(m.fecha_surtido)}</div>}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-right font-bold">
                      <span className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold",
                        m.stock_actual <= 5 ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                      )}>
                        {m.stock_actual}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button 
                        onClick={() => openEdit(m)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={editingMed ? "Editar Medicamento" : "Nuevo Medicamento"}
      >
        <form onSubmit={handleSave} className="space-y-4">
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
