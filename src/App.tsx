import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth, db } from './lib/firebase';
import { doc, getDoc, setDoc, deleteDoc, getDocs, collection, writeBatch, serverTimestamp, query, onSnapshot, where } from 'firebase/firestore';
import { LogOut, Activity, Download, Sun, Moon, Shield, ShieldCheck, ShieldAlert, RefreshCw, Check, Trash2, Loader2, AlertTriangle, Sparkles, Building } from 'lucide-react';
import Dashboard from './components/Dashboard';
import { UserRole } from './types';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const MASTER_EMAIL = '482400503@alumnos.utzac.edu.mx';

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);
  
  // Theme state
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  // Onboarding registration state
  const [registerClinicName, setRegisterClinicName] = useState('');
  const [registerBossName, setRegisterBossName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Master Panel State
  const [masterTab, setMasterTab] = useState<'admins' | 'purge'>('admins');
  const [allAdminRoles, setAllAdminRoles] = useState<UserRole[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState<string | null>(null);
  const [selectedLinkSystems, setSelectedLinkSystems] = useState<Record<string, string>>({});
  const [editingAdminEmail, setEditingAdminEmail] = useState<string | null>(null);
  const [selectedEditSystemId, setSelectedEditSystemId] = useState<string>('');
  const [confirmingAdminDeleteEmail, setConfirmingAdminDeleteEmail] = useState<string | null>(null);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const fetchUserRole = async (email: string) => {
    const lowerEmail = email.toLowerCase();
    
    // Check master override
    if (lowerEmail === MASTER_EMAIL) {
      setUserRole({
        email: lowerEmail,
        role: 'master',
        status: 'approved',
        name: 'Propietario Principal'
      });
      return;
    }

    try {
      const docRef = doc(db, 'user_roles', lowerEmail);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setUserRole(docSnap.data() as UserRole);
      } else {
        setUserRole(null);
      }
    } catch (err) {
      console.error('Error fetching user roles:', err);
    }
  };

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u && u.email) {
        setRoleLoading(true);
        await fetchUserRole(u.email);
        setRoleLoading(false);
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      unsubscribe();
    };
  }, []);

  // Listen to admin requests reactive-ly if Master is logged in
  useEffect(() => {
    if (userRole?.role !== 'master') return;

    setAdminsLoading(true);
    const q = query(collection(db, 'user_roles'), where('role', '==', 'admin'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roles: UserRole[] = [];
      snapshot.forEach((d) => {
        roles.push({ email: d.id, ...d.data() } as UserRole);
      });
      setAllAdminRoles(roles);
      setAdminsLoading(false);
    }, (err) => {
      console.error('Error listening to admin roles:', err);
      setAdminsLoading(false);
    });

    return () => unsubscribe();
  }, [userRole]);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    setAuthError(null);
    setIsAuthProcessing(true);
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
      const errorMsg = error as { code?: string; message?: string };
      if (errorMsg.code !== 'auth/popup-closed-by-user') {
        setAuthError('Error de acceso con Google: ' + (errorMsg.message || String(error)));
      }
    } finally {
      setIsAuthProcessing(false);
    }
  };

  const handleRefreshRole = async () => {
    if (user && user.email) {
      setRoleLoading(true);
      await fetchUserRole(user.email);
      setRoleLoading(false);
    }
  };

  const handleRegisterAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !user.email || !registerClinicName) return;

    setIsRegistering(true);
    try {
      const emailLower = user.email.toLowerCase();
      const newRole: UserRole = {
        email: emailLower,
        role: 'admin',
        status: 'pending',
        name: registerClinicName.trim()
      };
      await setDoc(doc(db, 'user_roles', emailLower), {
        ...newRole,
        bossName: registerBossName.trim(),
        createdAt: serverTimestamp()
      });
      setUserRole(newRole);
    } catch (err) {
      console.error('Error requesting admin permissions:', err);
    } finally {
      setIsRegistering(false);
    }
  };

  const handleApproveAdmin = async (adminEmail: string, customSystemId?: string) => {
    try {
      const finalSystemId = customSystemId || adminEmail;
      const updatedData: Partial<UserRole> = {
        status: 'approved',
        systemId: finalSystemId
      };
      
      if (customSystemId) {
        const existingClinic = allAdminRoles.find(r => r.systemId === customSystemId && r.status === 'approved');
        if (existingClinic) {
          updatedData.name = existingClinic.name;
        }
      }
      
      await setDoc(doc(db, 'user_roles', adminEmail), updatedData, { merge: true });
    } catch (err) {
      console.error('Error approving admin:', err);
    }
  };

  const handleUpdateSystemId = async (adminEmail: string, targetSystemId: string) => {
    try {
      const existingClinic = allAdminRoles.find(r => r.systemId === targetSystemId && r.status === 'approved');
      const updatedData: Partial<UserRole> = {
        systemId: targetSystemId
      };
      if (existingClinic) {
        updatedData.name = existingClinic.name;
      }
      await setDoc(doc(db, 'user_roles', adminEmail), updatedData, { merge: true });
      setEditingAdminEmail(null);
    } catch (err) {
      console.error('Error updating system link:', err);
      alert('Error al actualizar el enlace del sistema.');
    }
  };

  const handleRejectAdmin = async (adminEmail: string) => {
    try {
      await deleteDoc(doc(db, 'user_roles', adminEmail));
    } catch (err) {
      console.error('Error removing role:', err);
    }
  };

  const handlePurgePlatformData = async () => {
    if (!confirm('⚠️ ¡ATENCIÓN CRÍTICA! ⚠️\n\n¿Estás ABSOLUTAMENTE SEGURO de querer borrar todos los registros de toda la plataforma?\n\nEsta acción eliminará de forma PERMANENTE e IRREVERSIBLE todos los medicamentos del inventario, los registros de salidas de antibióticos y las entregas a pacientes sin expediente de TODOS los administradores y clínicas.\n\nEsta acción no puede deshacerse.')) {
      return;
    }

    setIsPurging(true);
    setPurgeSuccess(null);

    try {
      const collections = ['medications', 'logs', 'patientsRegistry'];
      
      for (const collName of collections) {
        const qSnap = await getDocs(collection(db, collName));
        let batch = writeBatch(db);
        let count = 0;
        
        for (const docItem of qSnap.docs) {
          batch.delete(doc(db, collName, docItem.id));
          count++;
          
          if (count === 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        
        if (count > 0) {
          await batch.commit();
        }
      }

      setPurgeSuccess('¡Limpieza Completada! Todos los registros históricos de medicamentos, registros médicos y de pacientes han sido permanentemente eliminados de Firebase Firestore.');
    } catch (err) {
      console.error('Error purging database collections:', err);
      alert('Hubo un error al purgar algunos datos. Intente de nuevo.');
    } finally {
      setIsPurging(false);
    }
  };

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 gap-4">
        <Activity className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-500" />
        <span className="text-sm font-bold text-gray-500 dark:text-gray-450">Verificando Credenciales...</span>
      </div>
    );
  }

  // Login Screen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-10">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-lg dark:shadow-blue-900/10 max-w-sm w-full text-center border border-transparent dark:border-gray-800 space-y-6">
          <div className="space-y-2">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-2">
              <Activity className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Botica Cessa Pinos</h1>
            <p className="text-gray-500 dark:text-gray-400 font-semibold text-sm">Sistema Clínico e Inventario Multiclínicas</p>
          </div>

          <div className="space-y-4 py-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed text-center px-1">
              Conéctate al instante usando tu cuenta de Google (@gmail.com o correo institucional).
            </p>

            {authError && (
              <div className="p-3 bg-red-50 text-red-600 dark:bg-red-955/35 dark:text-red-400 rounded-lg text-xs leading-relaxed font-semibold text-left">
                {authError}
              </div>
            )}

            <button
              onClick={login}
              disabled={isAuthProcessing}
              className="w-full bg-blue-600 dark:bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500 text-white font-bold py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm text-sm disabled:opacity-50"
            >
              {isAuthProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Ingresando...
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4" />
                  Iniciar Sesión con Google
                </>
              )}
            </button>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-850 pt-4 flex flex-col gap-2">
            <button
              onClick={() => setIsDark(!isDark)}
              className="w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold py-2 px-4 rounded-lg transition-colors border border-gray-200 dark:border-gray-700 text-sm"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              Modo {isDark ? 'Claro' : 'Oscuro'}
            </button>

            {installPrompt && (
              <button
                onClick={handleInstall}
                className="w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold py-2 px-4 rounded-lg transition-colors border border-gray-200 dark:border-gray-700 text-sm"
              >
                <Download className="w-4 h-4" />
                Instalar Aplicación (PWA)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // UNREGISTERED ONBOARDING SCREEN
  if (!userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4 py-8">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-lg max-w-md w-full border border-gray-200 dark:border-gray-800 space-y-6">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600 dark:text-blue-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Botica Cessa Pinos</h1>
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Se requiere Acceso Autorizado</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No dispones de un rol configurado aún. Para administrar un nuevo sistema independiente con bases de datos segregadas, por favor solicita acceso a continuación.
            </p>
          </div>

          <form onSubmit={handleRegisterAdmin} className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200">Registrar Solicitud Administrativa</h3>
            
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Nombre de la Clínica u Hospital
              </label>
              <input
                type="text"
                required
                value={registerClinicName}
                onChange={(e) => setRegisterClinicName(e.target.value)}
                placeholder="Ejemplo: Clínica Vicente Guerrero"
                className="w-full text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Tu Nombre Completo / Director Responsable
              </label>
              <input
                type="text"
                required
                value={registerBossName}
                onChange={(e) => setRegisterBossName(e.target.value)}
                placeholder="Dr. Vicente López"
                className="w-full text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={isRegistering}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 text-sm"
            >
              {isRegistering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando Solicitud...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Solicitar Registro como Administrador
                </>
              )}
            </button>
          </form>

          <div className="p-4 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            <strong>¿Eres un encargado de registro clínico?</strong><br />
            Solicita al Director o Administrador de tu clínica que ingrese tu correo registrado (<strong>{user?.email || ''}</strong>) dentro de su sección de encargados para asignarte acceso automático a su base de datos independiente.
          </div>

          <button
            onClick={() => signOut(auth)}
            className="w-full text-xs font-semibold text-red-500 hover:text-red-600 flex items-center justify-center gap-1 py-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  // PENDING REQUEST SCREEN
  if (userRole.role === 'admin' && userRole.status === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-lg border border-yellow-200 dark:border-yellow-950/20 max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-yellow-50 dark:bg-yellow-950/20 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8 text-yellow-600 dark:text-yellow-400" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Solicitud Pendiente de Aprobación</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Tu solicitud para fundar el sistema de la clínica:
            </p>
            <p className="font-extrabold text-lg text-blue-600 dark:text-blue-400">
              "{userRole.name}"
            </p>
            <p className="text-xs text-gray-450 dark:text-gray-500 pt-1 leading-relaxed">
              Está siendo revisada por el Propietario Principal. Comunícate con él para que autorice y active tu base de datos dedicada.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRefreshRole}
              className="flex-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 text-sm font-bold py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors border border-gray-205 dark:border-gray-750"
            >
              <RefreshCw className="w-4 h-4" />
              Verificar Estado
            </button>
            <button
              onClick={() => signOut(auth)}
              className="px-4 bg-red-50 hover:bg-red-100 dark:bg-red-955/20 dark:hover:bg-red-955/40 text-red-600 dark:text-red-400 text-sm font-bold rounded-lg transition-colors border border-red-100 dark:border-red-900/30"
            >
              Salir
            </button>
          </div>
        </div>
      </div>
    );
  }

  // MASTER DASHBOARD OWNER PANEL
  if (userRole.role === 'master') {
    const listPending = allAdminRoles.filter(r => r.status === 'pending');
    const listApproved = allAdminRoles.filter(r => r.status === 'approved');

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
        <header className="bg-white dark:bg-gray-900 shadow-sm border-b dark:border-gray-800 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                Botica Cessa Pinos
                <span className="text-xs bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/20 px-2 py-0.5 rounded font-extrabold uppercase">
                  Propietario Central
                </span>
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsDark(!isDark)}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button
                onClick={() => signOut(auth)}
                className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Cerrar Sesión"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Master Navigation Rails */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          <div className="flex border-b border-gray-200 dark:border-gray-800 gap-6">
            <button
              onClick={() => setMasterTab('admins')}
              className={`pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
                masterTab === 'admins'
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 font-extrabold'
                  : 'border-transparent text-gray-500'
              }`}
            >
              <Building className="w-4 h-4" />
              Clínicas y Sistemas ({allAdminRoles.length})
            </button>
            <button
              onClick={() => {
                setMasterTab('purge');
                setPurgeSuccess(null);
              }}
              className={`pb-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${
                masterTab === 'purge'
                  ? 'border-red-500 text-red-600 dark:text-red-400 font-extrabold'
                  : 'border-transparent text-gray-500'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Purgar / Limpieza de Datos
            </button>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            {masterTab === 'admins' && (
              <div className="space-y-8">
                {/* Pending Requests */}
                <div className="space-y-4">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 animate-pulse" />
                    Solicitudes de Nuevas Clínicas ({listPending.length})
                  </h2>

                  {adminsLoading ? (
                    <div className="py-8 flex justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    </div>
                  ) : listPending.length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl text-gray-400">
                      No hay solicitudes de clínicas pendientes de aprobación por el momento.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {listPending.map((req) => (
                        <div key={req.email} className="p-4 bg-yellow-50/20 dark:bg-yellow-950/5 border border-yellow-100/15 dark:border-yellow-950/10 rounded-xl space-y-3">
                          <div>
                            <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider block">Nueva Solicitud</span>
                            <h3 className="text-base font-extrabold text-gray-900 dark:text-white">{req.name}</h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1"><strong>Responsable:</strong> {req.bossName || 'Sin Registrar'}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400"><strong>Correo:</strong> {req.email}</p>
                          </div>
                          
                          <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800/50">
                            {listApproved.length > 0 && (
                              <div className="space-y-1">
                                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                  Vincular a clínica existente (Base de datos compartida):
                                </label>
                                <select
                                  value={selectedLinkSystems[req.email] || ''}
                                  onChange={(e) => setSelectedLinkSystems(prev => ({ ...prev, [req.email]: e.target.value }))}
                                  className="w-full text-xs bg-white dark:bg-gray-800 text-gray-950 dark:text-gray-100 border border-gray-300 dark:border-gray-700 py-1.5 px-2.5 rounded-lg focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="">-- Crear Nuevo Sistema Independiente --</option>
                                  {listApproved.reduce((acc, current) => {
                                    if (!acc.find(item => item.systemId === current.systemId)) {
                                      acc.push(current);
                                    }
                                    return acc;
                                  }, [] as UserRole[]).map((appr) => (
                                    <option key={appr.systemId} value={appr.systemId}>
                                      {appr.name} ({appr.systemId})
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}

                            <div className="flex gap-2">
                              {confirmingAdminDeleteEmail === req.email ? (
                                <div className="flex-1 flex items-center justify-between gap-1.5 bg-red-50/50 dark:bg-red-950/20 px-2 py-1.5 rounded-lg border border-red-100 dark:border-red-900/30">
                                  <span className="text-[10px] text-red-650 dark:text-red-400 font-bold animate-pulse">¿Rechazar petición?</span>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => {
                                        handleRejectAdmin(req.email);
                                        setConfirmingAdminDeleteEmail(null);
                                      }}
                                      className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[10px] rounded-md transition-colors shadow-sm"
                                    >
                                      Sí
                                    </button>
                                    <button
                                      onClick={() => setConfirmingAdminDeleteEmail(null)}
                                      className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium text-[10px] rounded-md transition-colors"
                                    >
                                      No
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleApproveAdmin(req.email, selectedLinkSystems[req.email])}
                                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    {selectedLinkSystems[req.email] ? 'Aprobar y Vincular' : 'Aprobar y Crear Sistema'}
                                  </button>
                                  <button
                                    onClick={() => setConfirmingAdminDeleteEmail(req.email)}
                                    className="px-3 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-955/45 text-red-650 dark:text-red-400 font-semibold rounded-lg text-xs transition-colors"
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Approved Admins */}
                <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-green-600" />
                    Sistemas Clínicos Independientes Instalados ({listApproved.length})
                  </h2>

                  {listApproved.length === 0 ? (
                    <div className="p-6 text-center border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-xl text-gray-400">
                      No hay sistemas activos en la plataforma.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 dark:border-gray-800 text-gray-400 font-bold">
                            <th className="pb-3 text-xs uppercase tracking-wider">Clínica / Hospital</th>
                            <th className="pb-3 text-xs uppercase tracking-wider">Encargado Responsable</th>
                            <th className="pb-3 text-xs uppercase tracking-wider">ID de Sistema Segregado (UID)</th>
                            <th className="pb-3 text-right">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                          {listApproved.map((admin) => (
                            <tr key={admin.email} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/10 transition-colors">
                              <td className="py-4 pr-3 font-bold text-gray-900 dark:text-white">{admin.name}</td>
                              <td className="py-4 pr-3 text-gray-500 dark:text-gray-400">
                                <span className="block font-semibold">{admin.bossName || 'N/A'}</span>
                                <span className="text-xs text-gray-400 dark:text-gray-500 block">{admin.email}</span>
                              </td>
                              <td className="py-4 text-gray-700 dark:text-gray-300">
                                {editingAdminEmail === admin.email ? (
                                  <div className="flex items-center gap-2 max-w-xs">
                                    <select
                                      value={selectedEditSystemId}
                                      onChange={(e) => setSelectedEditSystemId(e.target.value)}
                                      className="text-xs bg-white dark:bg-gray-800 text-gray-950 dark:text-gray-100 border border-gray-350 dark:border-gray-700 py-1 px-1.5 rounded-md focus:ring-1 focus:ring-blue-550"
                                    >
                                      <option value={admin.email}>{admin.email} (Rol Propio/Nuevo)</option>
                                      {listApproved.filter(o => o.email !== admin.email).reduce((acc, current) => {
                                        if (!acc.find(item => item.systemId === current.systemId)) {
                                          acc.push(current);
                                        }
                                        return acc;
                                      }, [] as UserRole[]).map((appr) => (
                                        <option key={appr.systemId} value={appr.systemId}>
                                          {appr.name} ({appr.systemId})
                                        </option>
                                      ))}
                                    </select>
                                    <button
                                      onClick={() => handleUpdateSystemId(admin.email, selectedEditSystemId)}
                                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-2 py-1 rounded text-xs transition-colors shrink-0"
                                    >
                                      Guardar
                                    </button>
                                    <button
                                      onClick={() => setEditingAdminEmail(null)}
                                      className="bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 font-semibold px-2 py-1 rounded text-xs transition-colors shrink-0"
                                    >
                                      Cancelar
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                    <span className="font-mono text-xs">{admin.systemId}</span>
                                    <button
                                      onClick={() => {
                                        setEditingAdminEmail(admin.email);
                                        setSelectedEditSystemId(admin.systemId || admin.email);
                                      }}
                                      className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline font-bold text-left"
                                    >
                                      (Vincular a otro sistema)
                                    </button>
                                  </div>
                                )}
                              </td>
                              <td className="py-4 text-right">
                                {confirmingAdminDeleteEmail === admin.email ? (
                                  <div className="inline-flex items-center gap-2">
                                    <span className="text-xs text-red-650 dark:text-red-400 font-bold animate-pulse">¿Desactivar?</span>
                                    <button
                                      onClick={() => {
                                        handleRejectAdmin(admin.email);
                                        setConfirmingAdminDeleteEmail(null);
                                      }}
                                      className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-md transition-colors shadow-sm"
                                    >
                                      Sí
                                    </button>
                                    <button
                                      onClick={() => setConfirmingAdminDeleteEmail(null)}
                                      className="px-2 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-300 font-medium text-xs rounded-md transition-colors"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmingAdminDeleteEmail(admin.email)}
                                    className="p-1 px-2.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/20 dark:text-red-400 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Desactivar Sistema
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
            )}

            {masterTab === 'purge' && (
              <div className="max-w-2xl space-y-6">
                <div className="p-5 bg-red-50/50 dark:bg-red-955/10 border border-red-100 dark:border-red-900/30 rounded-xl flex items-start gap-4">
                  <AlertTriangle className="w-10 h-10 text-red-600 shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <h3 className="font-extrabold text-red-700 dark:text-red-400 text-base">Acción Crítica: Purga Completa de Firebase</h3>
                    <p className="text-sm text-red-600/90 dark:text-red-400/80 leading-relaxed">
                      Esta operación es irreversible y responderá de inmediato al requerimiento de limpieza total de registros del software. Se eliminarán permanentemente todos los registros históricos de medicamentos que existen en todas las boticas registradas de la plataforma.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    Al confirmar, el sistema ejecutará un barrido de eliminación por bloques en las siguientes colecciones:
                  </p>
                  <ul className="list-disc pl-5 text-xs text-gray-500 dark:text-gray-450 space-y-1 font-mono">
                    <li>medications</li>
                    <li>logs</li>
                    <li>patientsRegistry</li>
                  </ul>
                </div>

                {purgeSuccess && (
                  <div className="p-4 bg-green-50 text-green-700 dark:bg-green-955/25 dark:text-green-400 font-bold rounded-lg text-sm">
                    {purgeSuccess}
                  </div>
                )}

                <button
                  onClick={handlePurgePlatformData}
                  disabled={isPurging}
                  className="bg-red-600 hover:bg-red-705 text-white font-extrabold text-sm py-3 px-6 rounded-lg shadow-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isPurging ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Eliminando Registros...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-5 h-5" />
                      Eliminar permanentemente todos los registros actuales
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  // STANDARD APPROVED USER AREA (ADMINS & STAFF)
  const systemId = userRole.systemId || user.email.toLowerCase();
  const userSystemRole = userRole.role === 'admin' ? 'admin' : 'encargado';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="bg-white dark:bg-gray-900 shadow-sm border-b dark:border-gray-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600 dark:text-blue-500" />
            <h1 className="text-xl font-bold text-gray-900 dark:text-white overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-2">
              Botica Cessa Pinos
              <span className="text-xs bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded font-bold border border-blue-100 dark:border-blue-900/20">
                {userRole.name || 'Clínica Activa'}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            {installPrompt && (
              <button
                onClick={handleInstall}
                className="hidden md:flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors border border-blue-100 dark:border-blue-900/30"
              >
                <Download className="w-4 h-4" />
                Instalar App
              </button>
            )}
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title={isDark ? 'Modo claro' : 'Modo oscuro'}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <span className="text-xs font-semibold text-gray-650 dark:text-gray-400 hidden lg:inline-block max-w-[200px] overflow-hidden text-ellipsis bg-gray-105 dark:bg-gray-805 px-2 py-1 rounded">
              {user.email} ({userRole.role})
            </span>
            <button
              onClick={() => signOut(auth)}
              className="p-2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {installPrompt && (
          <div className="mb-6 md:hidden">
            <button
              onClick={handleInstall}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 dark:bg-blue-600 text-white p-4 rounded-xl shadow-lg font-bold animate-pulse text-sm"
            >
              <Download className="w-5 h-5" />
              Descargar y Usar Aplicación
            </button>
          </div>
        )}
        
        {/* Render standard segregated system */}
        <Dashboard systemId={systemId} role={userSystemRole} />
      </main>
    </div>
  );
}
