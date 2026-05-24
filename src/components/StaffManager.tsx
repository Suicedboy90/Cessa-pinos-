import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { UserRole } from '../types';
import { Plus, Trash2, Shield, Loader2, Users, AlertCircle, CheckCircle } from 'lucide-react';

interface StaffManagerProps {
  systemId: string;
}

export default function StaffManager({ systemId }: StaffManagerProps) {
  const [staffList, setStaffList] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmingEmail, setConfirmingEmail] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'user_roles'), where('addedBy', '==', systemId), where('role', '==', 'encargado'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const staff: UserRole[] = [];
      snapshot.forEach((d) => {
        staff.push({ email: d.id, ...d.data() } as UserRole);
      });
      setStaffList(staff);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching staff list:', err);
      setLoading(false);
      handleFirestoreError(err, OperationType.LIST, 'user_roles');
    });

    return () => unsubscribe();
  }, [systemId]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const formattedEmail = email.trim().toLowerCase();

    try {
      // Create user role document
      await setDoc(doc(db, 'user_roles', formattedEmail), {
        email: formattedEmail,
        role: 'encargado',
        status: 'approved',
        systemId,
        name: name.trim(),
        addedBy: systemId,
        createdAt: serverTimestamp()
      });

      setEmail('');
      setName('');
      setSuccess(`Se ha registrado correctamente a ${name} como Encargado.`);
      
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      console.error('Error registering encargado:', err);
      setError('Error al registrar al encargado. Por favor verifique los permisos.');
      handleFirestoreError(err, OperationType.WRITE, `user_roles/${formattedEmail}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStaff = async (staffEmail: string, staffName: string) => {
    setError(null);
    setSuccess(null);
    try {
      await deleteDoc(doc(db, 'user_roles', staffEmail));
      setSuccess(`Acceso retirado correctamente a ${staffName}.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error('Error deleting staff:', err);
      setError('Error al retirar accesos. No cuentas con los privilegios suficientes.');
      handleFirestoreError(err, OperationType.DELETE, `user_roles/${staffEmail}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Shield className="w-6 h-6 text-blue-600 dark:text-blue-500" />
          Administrar Encargados de Registro
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Registra a los miembros de tu equipo de enfermería y personal de farmacia. Las personas registradas podrán iniciar sesión con sus cuentas de Google y registrar medicamentos y movimientos únicamente dentro de tu clínica.
        </p>
      </div>

      {/* Primary Notifications Area */}
      {error && (
        <div className="p-4 bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200 dark:border-red-900/40 rounded-xl text-sm flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold text-red-850 dark:text-red-350">Error</h4>
            <p className="text-xs mt-0.5 text-red-700/80 dark:text-red-400/80">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 dark:hover:text-red-350 text-xs font-bold px-2 py-1">Descartar</button>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-200 dark:border-green-900/40 rounded-xl text-sm flex items-start gap-3 shadow-sm">
          <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold text-green-850 dark:text-green-350">Atención</h4>
            <p className="text-xs mt-0.5 text-green-700/80 dark:text-green-400/80">{success}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-400 hover:text-green-600 dark:hover:text-green-350 text-xs font-bold px-2 py-1">Descartar</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form to Register Staff */}
        <div className="bg-gray-50 dark:bg-gray-900/40 p-5 rounded-xl border border-gray-200 dark:border-gray-800 space-y-4">
          <h3 className="font-bold text-gray-900 dark:text-white text-base">Nuevo Encargado</h3>
          
          <form onSubmit={handleAddStaff} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Correo Electrónico (Google)
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@gmail.com"
                className="w-full text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-850 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Nombre Completo / Cargo
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enf. María Pérez"
                className="w-full text-sm bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-850 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Agregar Encargado
                </>
              )}
            </button>
          </form>
        </div>

        {/* Staff Members List */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900/20 p-5 rounded-xl border border-gray-200 dark:border-gray-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-400" />
              Lista de Encargados de Registro ({staffList.length})
            </h3>
          </div>

          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : staffList.length === 0 ? (
            <div className="py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
              <Users className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-sm font-bold text-gray-500 dark:text-gray-400">No hay encargados registrados</p>
              <p className="text-xs text-gray-450 dark:text-gray-500 max-w-sm mx-auto mt-1">
                Utiliza el formulario de la izquierda para autorizar a un colega agregando su correo electrónico.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-450 dark:text-gray-500 font-bold">
                    <th className="pb-3 text-xs uppercase tracking-wider">Nombre / Cargo</th>
                    <th className="pb-3 text-xs uppercase tracking-wider">Correo Electrónico</th>
                    <th className="pb-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                  {staffList.map((staff) => (
                    <tr key={staff.email} className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                      <td className="py-3 pr-2">
                        <span className="font-bold text-gray-900 dark:text-white block">{staff.name || 'Encargado'}</span>
                      </td>
                      <td className="py-3 text-gray-500 dark:text-gray-400">{staff.email}</td>
                      <td className="py-3 text-right">
                        {confirmingEmail === staff.email ? (
                          <div className="inline-flex items-center gap-2">
                            <span className="text-xs text-red-650 dark:text-red-400 font-bold animate-pulse">¿Retirar?</span>
                            <button
                              onClick={() => {
                                handleDeleteStaff(staff.email, staff.name || '');
                                setConfirmingEmail(null);
                              }}
                              className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-md transition-colors shadow-sm"
                            >
                              Sí
                            </button>
                            <button
                              onClick={() => setConfirmingEmail(null)}
                              className="px-2 py-1 bg-gray-100 hover:bg-gray-250 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 font-medium text-xs rounded-md transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmingEmail(staff.email)}
                            className="p-1 px-2.5 bg-red-50 hover:bg-red-100/80 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 font-bold text-xs rounded-md transition-colors inline-flex items-center gap-1.5 shadow-sm"
                            title="Retirar acceso"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Retirar Acceso
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
