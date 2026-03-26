/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  updateDoc, 
  serverTimestamp, 
  getDocs,
  limit,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  UserProfile, 
  Order, 
  GlobalSettings, 
  OrderStatus, 
  Priority, 
  AuditLog,
  UserRole
} from './types';
import { translations, Language } from './translations';
import { cn } from './lib/utils';
import { 
  Coffee, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Settings as SettingsIcon, 
  LogOut, 
  Plus, 
  ChevronRight, 
  BarChart3, 
  History, 
  User,
  ShieldAlert,
  Menu,
  X,
  Zap,
  CheckCircle,
  PlayCircle,
  PauseCircle,
  Ban
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from 'recharts';
import { format, formatDistanceToNow, isAfter, addMinutes } from 'date-fns';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  toast.error(`Database error: ${errInfo.error}`);
}

// --- Components ---

const LOGO_URL = "https://ais-dev-lslqooqc5dikad3d6zh642-533211590098.europe-west2.run.app/api/v1/files/0195e687-5757-7977-989f-856149819717";

const LoadingScreen = ({ lang }: { lang: Language }) => {
  const t = translations[lang];
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50">
      <div className="relative w-24 h-24 mb-8">
        <img src={LOGO_URL} alt="Logo" className="w-full h-full object-contain animate-pulse" referrerPolicy="no-referrer" />
      </div>
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 border-4 border-neutral-200 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-brand-primary rounded-full border-t-transparent animate-spin"></div>
      </div>
      <p className="mt-4 text-neutral-600 font-medium animate-pulse">{t.brewing}</p>
    </div>
  );
};

const RoleBadge = ({ role, lang }: { role: string, lang: Language }) => {
  const t = translations[lang];
  const colors = {
    admin: 'bg-red-100 text-red-700 border-red-200',
    office_boy: 'bg-teal-100 text-teal-700 border-teal-200',
    employee: 'bg-green-100 text-green-700 border-green-200',
  };
  const roleLabels = {
    admin: t.admin,
    office_boy: t.officeBoy,
    employee: t.employee,
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", colors[role as keyof typeof colors])}>
      {roleLabels[role as keyof typeof roleLabels] || role.replace('_', ' ')}
    </span>
  );
};

const StatusBadge = ({ status, lang }: { status: OrderStatus, lang: Language }) => {
  const t = translations[lang];
  const configs = {
    pending: { color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Clock, label: t.pendingRequests.split(' ')[0] },
    accepted: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CheckCircle, label: t.accept },
    in_progress: { color: 'bg-teal-100 text-teal-700 border-teal-200', icon: PlayCircle, label: t.startMaking.split(' ')[0] },
    completed: { color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle2, label: t.completeDeliver.split(' ')[0] },
    cancelled: { color: 'bg-neutral-100 text-neutral-700 border-neutral-200', icon: Ban, label: t.cancel },
  };
  const { color, icon: Icon, label } = configs[status];
  return (
    <span className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border", color)}>
      <Icon size={14} />
      {label}
    </span>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'admin' | 'settings'>('dashboard');
  const [viewOverride, setViewOverride] = useState<UserRole | null>(null);
  const [lang, setLang] = useState<Language>('en');

  const t = translations[lang];

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Auth & Profile
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const isAdminEmail = firebaseUser.email === 'marwanmohssen28@gmail.com';
          
          if (userDoc.exists()) {
            const data = userDoc.data() as UserProfile;
            // Auto-upgrade to admin if email matches but role is different
            if (isAdminEmail && data.role !== 'admin') {
              await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' });
              setProfile({ ...data, role: 'admin' });
            } else {
              setProfile(data);
            }
          } else {
            // Create default profile for new users
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Anonymous',
              role: isAdminEmail ? 'admin' : 'employee',
              dailyOrderCount: 0,
              weeklyOrderCount: 0,
              lastOrderTimestamp: null,
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Global Settings
  useEffect(() => {
    if (!user) return;
    
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as GlobalSettings);
      } else {
        // Initialize default settings if they don't exist
        const defaultSettings: GlobalSettings = {
          dailyLimit: 5,
          weeklyLimit: 25,
          slaMinutes: 15,
        };
        setDoc(doc(db, 'settings', 'global'), defaultSettings);
        setSettings(defaultSettings);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'settings/global'));
    return unsubscribe;
  }, [user]);

  // Real-time Orders
  useEffect(() => {
    if (!profile) return;

    let q;
    if (profile.role === 'employee') {
      q = query(collection(db, 'orders'), where('userId', '==', profile.uid), orderBy('createdAt', 'desc'), limit(50));
    } else {
      q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(newOrders);
      
      // Notify office boy of new pending orders
      if (profile.role === 'office_boy') {
        const pending = newOrders.filter(o => o.status === 'pending');
        if (pending.length > 0) {
          toast.info(`You have ${pending.length} pending orders!`, { icon: <Coffee /> });
        }
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'orders'));
    
    return unsubscribe;
  }, [profile]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      toast.error("Login failed. Please try again.");
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) return <LoadingScreen lang={lang} />;

  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-10 text-center border border-neutral-100">
          <div className="w-full h-24 flex items-center justify-center mx-auto mb-8">
            <img src={LOGO_URL} alt="Mofarreh Group" className="h-full object-contain" referrerPolicy="no-referrer" />
          </div>
          <h1 className="text-2xl font-bold text-brand-primary mb-2">{t.appName}</h1>
          <p className="text-neutral-500 mb-8">{t.tagline}</p>
          
          <div className="space-y-4">
            <button 
              onClick={handleLogin}
              className="w-full bg-brand-primary hover:bg-brand-secondary text-white font-bold py-4 px-6 rounded-2xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-teal-900/20"
            >
              <User size={20} />
              {t.signIn}
            </button>
            
            <button 
              onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
              className="w-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold py-3 px-6 rounded-2xl transition-all"
            >
              {t.switchLanguage}
            </button>
          </div>
          
          <p className="mt-8 text-xs text-neutral-400">{t.internalUse}</p>
        </div>
      </div>
    );
  }

  const currentRole = viewOverride || profile?.role || 'employee';

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans">
      <Toaster position="top-right" richColors />
      
      {/* Navigation */}
      <nav className="bg-white border-b border-neutral-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center gap-4">
              <div className="h-10">
                <img src={LOGO_URL} alt="Logo" className="h-full object-contain" referrerPolicy="no-referrer" />
              </div>
              <span className="font-bold text-lg hidden sm:block text-brand-primary">{t.appName}</span>
              
              {/* Admin View Switcher */}
              {profile?.role === 'admin' && (
                <div className="ml-8 hidden lg:flex bg-neutral-100 p-1 rounded-xl border border-neutral-200">
                  {(['admin', 'employee', 'office_boy'] as UserRole[]).map(r => (
                    <button
                      key={r}
                      onClick={() => setViewOverride(r)}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize",
                        currentRole === r ? "bg-white text-brand-primary shadow-sm" : "text-neutral-400 hover:text-neutral-600"
                      )}
                    >
                      {r.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-all"
              >
                {t.switchLanguage}
              </button>
              <div className="hidden md:flex items-center gap-2 mr-4">
                <div className={cn("text-right", lang === 'ar' && "text-left")}>
                  <p className="text-sm font-bold leading-none">{profile?.displayName}</p>
                  <RoleBadge role={profile?.role || 'employee'} lang={lang} />
                </div>
                <img 
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${profile?.displayName}`} 
                  alt="Avatar" 
                  className="w-10 h-10 rounded-full border-2 border-brand-secondary/20"
                />
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 text-neutral-400 hover:text-red-600 transition-colors"
                title={t.logout}
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentRole === 'employee' && <EmployeeView profile={profile!} orders={orders} settings={settings} lang={lang} />}
        {currentRole === 'office_boy' && <OfficeBoyView profile={profile!} orders={orders} lang={lang} />}
        {currentRole === 'admin' && <AdminView profile={profile!} orders={orders} settings={settings} lang={lang} />}
      </main>
    </div>
  );
}

// --- Views ---

function EmployeeView({ profile, orders, settings, lang }: { profile: UserProfile, orders: Order[], settings: GlobalSettings | null, lang: Language }) {
  const t = translations[lang];
  const [isOrdering, setIsOrdering] = useState(false);
  const [formData, setFormData] = useState({
    drinkType: 'Tea',
    sugarLevel: 'Medium',
    milk: false,
    notes: '',
    priority: 'normal' as Priority
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    // Check limits
    if (profile.dailyOrderCount >= settings.dailyLimit) {
      toast.error(lang === 'ar' ? "تم الوصول للحد اليومي!" : "Daily limit reached!");
      return;
    }

    try {
      const slaDeadline = addMinutes(new Date(), settings.slaMinutes).toISOString();
      const orderData = {
        userId: profile.uid,
        userName: profile.displayName,
        ...formData,
        status: 'pending',
        createdAt: new Date().toISOString(),
        slaDeadline
      };

      await addDoc(collection(db, 'orders'), orderData);
      
      // Update user counts
      await updateDoc(doc(db, 'users', profile.uid), {
        dailyOrderCount: profile.dailyOrderCount + 1,
        weeklyOrderCount: profile.weeklyOrderCount + 1,
        lastOrderTimestamp: new Date().toISOString()
      });

      // Audit log
      await addDoc(collection(db, 'audit_logs'), {
        action: 'order_created',
        userId: profile.uid,
        userName: profile.displayName,
        timestamp: new Date().toISOString(),
        details: `Ordered ${formData.drinkType}`
      });

      toast.success(lang === 'ar' ? "تم إرسال الطلب بنجاح!" : "Order submitted successfully!");
      setIsOrdering(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    }
  };

  return (
    <div className="space-y-8">
      {/* Stats Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm">
          <p className="text-neutral-500 text-sm font-medium mb-1">{t.dailyOrders}</p>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold">{profile.dailyOrderCount}</span>
            <span className="text-neutral-400 mb-1">/ {settings?.dailyLimit}</span>
          </div>
          <div className="mt-4 w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-brand-secondary h-full transition-all duration-500" 
              style={{ width: `${(profile.dailyOrderCount / (settings?.dailyLimit || 1)) * 100}%` }}
            />
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-neutral-500 text-sm font-medium mb-1">{t.activeOrders}</p>
            <span className="text-3xl font-bold">{orders.filter(o => ['pending', 'accepted', 'in_progress'].includes(o.status)).length}</span>
          </div>
          <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center text-brand-secondary">
            <Zap size={24} />
          </div>
        </div>

        <button 
          onClick={() => setIsOrdering(true)}
          disabled={profile.dailyOrderCount >= (settings?.dailyLimit || 0)}
          className="bg-brand-primary hover:bg-brand-secondary disabled:bg-neutral-300 text-white rounded-3xl p-6 shadow-lg shadow-teal-900/10 transition-all flex flex-col items-center justify-center gap-2 group"
        >
          <Plus size={32} className="group-hover:scale-110 transition-transform" />
          <span className="font-bold">{t.newOrder}</span>
        </button>
      </div>

      {/* Order Form Modal */}
      {isOrdering && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">{t.customizeDrink}</h2>
              <button onClick={() => setIsOrdering(false)} className="text-neutral-400 hover:text-neutral-600">
                <X size={24} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2">{t.drinkType}</label>
                  <select 
                    value={formData.drinkType}
                    onChange={e => setFormData({...formData, drinkType: e.target.value})}
                    className="w-full bg-neutral-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="Tea">{t.tea}</option>
                    <option value="Coffee">{t.coffee}</option>
                    <option value="Water">{t.water}</option>
                    <option value="Green Tea">{t.greenTea}</option>
                    <option value="Latte">{t.latte}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-neutral-700 mb-2">{t.sugarLevel}</label>
                  <select 
                    value={formData.sugarLevel}
                    onChange={e => setFormData({...formData, sugarLevel: e.target.value})}
                    className="w-full bg-neutral-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-brand-primary"
                  >
                    <option value="None">{t.none}</option>
                    <option value="Low">{t.low}</option>
                    <option value="Medium">{t.medium}</option>
                    <option value="High">{t.high}</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.milk}
                    onChange={e => setFormData({...formData, milk: e.target.checked})}
                    className="w-5 h-5 rounded border-neutral-300 text-brand-primary focus:ring-brand-primary"
                  />
                  <span className="text-sm font-medium">{t.addMilk}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={formData.priority === 'urgent'}
                    onChange={e => setFormData({...formData, priority: e.target.checked ? 'urgent' : 'normal'})}
                    className="w-5 h-5 rounded border-neutral-300 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-sm font-medium text-red-600">{t.urgentPriority}</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-2">{t.specialNotes}</label>
                <textarea 
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  placeholder={t.notesPlaceholder}
                  className="w-full bg-neutral-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-brand-primary h-24 resize-none"
                />
              </div>

              <button 
                type="submit"
                className="w-full bg-brand-primary hover:bg-brand-secondary text-white font-bold py-4 rounded-2xl shadow-lg shadow-teal-900/10 transition-all"
              >
                {t.placeOrder}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Order History */}
      <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <History size={20} className="text-brand-primary" />
            {t.recentOrders}
          </h2>
        </div>
        <div className="divide-y divide-neutral-50">
          {orders.length === 0 ? (
            <div className="p-12 text-center text-neutral-400">
              <Coffee size={48} className="mx-auto mb-4 opacity-20" />
              <p>{t.noOrders}</p>
            </div>
          ) : (
            orders.map(order => (
              <div key={order.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-neutral-50 transition-colors">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center",
                    order.priority === 'urgent' ? "bg-red-50 text-red-600" : "bg-neutral-50 text-neutral-600"
                  )}>
                    <Coffee size={24} />
                  </div>
                  <div>
                    <h3 className="font-bold text-neutral-900">{lang === 'ar' ? (t[order.drinkType.toLowerCase().replace(' ', '') as keyof typeof t] || order.drinkType) : order.drinkType}</h3>
                    <p className="text-xs text-neutral-500">
                      {lang === 'ar' ? t[order.sugarLevel.toLowerCase() as keyof typeof t] : order.sugarLevel} {lang === 'ar' ? 'سكر' : 'Sugar'} • {order.milk ? (lang === 'ar' ? 'مع حليب' : 'With Milk') : (lang === 'ar' ? 'بدون حليب' : 'No Milk')}
                    </p>
                    <p className="text-[10px] text-neutral-400 mt-1">
                      {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {order.priority === 'urgent' && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded uppercase tracking-wider">
                      <AlertCircle size={12} /> {t.urgent}
                    </span>
                  )}
                  <StatusBadge status={order.status} lang={lang} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function OfficeBoyView({ profile, orders, lang }: { profile: UserProfile, orders: Order[], lang: Language }) {
  const t = translations[lang];
  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'accepted') updates.acceptedAt = new Date().toISOString();
      if (newStatus === 'in_progress') updates.startedAt = new Date().toISOString();
      if (newStatus === 'completed') updates.completedAt = new Date().toISOString();

      await updateDoc(doc(db, 'orders', orderId), updates);
      
      // Audit log
      await addDoc(collection(db, 'audit_logs'), {
        action: `order_${newStatus}`,
        userId: profile.uid,
        userName: profile.displayName,
        timestamp: new Date().toISOString(),
        details: `Order ${orderId} moved to ${newStatus}`
      });

      toast.success(lang === 'ar' ? `تم تحديث الطلب إلى ${newStatus}!` : `Order ${newStatus}!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const activeOrders = orders.filter(o => ['accepted', 'in_progress'].includes(o.status));

  return (
    <div className="space-y-8">
      {/* Active Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Pending Queue */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Clock className="text-yellow-600" />
            {t.pendingRequests} ({pendingOrders.length})
          </h2>
          <div className="space-y-4">
            {pendingOrders.map(order => (
              <div key={order.id} className={cn(
                "bg-white p-6 rounded-3xl border-2 shadow-sm transition-all animate-in slide-in-from-left duration-300",
                order.priority === 'urgent' ? "border-red-200 bg-red-50/30" : "border-neutral-100"
              )}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold">{order.userName}</h3>
                    <p className="text-sm text-neutral-500">
                      {lang === 'ar' ? (t[order.drinkType.toLowerCase().replace(' ', '') as keyof typeof t] || order.drinkType) : order.drinkType} • {lang === 'ar' ? t[order.sugarLevel.toLowerCase() as keyof typeof t] : order.sugarLevel} {lang === 'ar' ? 'سكر' : 'Sugar'}
                    </p>
                  </div>
                  {order.priority === 'urgent' && (
                    <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full animate-pulse">{t.urgent}</span>
                  )}
                </div>
                {order.notes && (
                  <div className="bg-neutral-50 p-3 rounded-xl text-sm italic text-neutral-600 mb-4 border border-neutral-100">
                    "{order.notes}"
                  </div>
                )}
                <div className="flex gap-2">
                  <button 
                    onClick={() => updateStatus(order.id, 'accepted')}
                    className="flex-1 bg-brand-primary hover:bg-brand-secondary text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={18} /> {t.accept}
                  </button>
                  <button 
                    onClick={() => updateStatus(order.id, 'cancelled')}
                    className="px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 font-bold py-3 rounded-xl transition-all"
                  >
                    <Ban size={18} />
                  </button>
                </div>
              </div>
            ))}
            {pendingOrders.length === 0 && (
              <div className="bg-white p-12 rounded-3xl border border-dashed border-neutral-200 text-center text-neutral-400">
                {t.noOrders} 🎉
              </div>
            )}
          </div>
        </div>

        {/* Active Work */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <PlayCircle className="text-brand-secondary" />
            {t.activeOrders} ({activeOrders.length})
          </h2>
          <div className="space-y-4">
            {activeOrders.map(order => (
              <div key={order.id} className="bg-white p-6 rounded-3xl border border-teal-100 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold">{order.userName}</h3>
                    <p className="text-sm text-neutral-500">{lang === 'ar' ? (t[order.drinkType.toLowerCase().replace(' ', '') as keyof typeof t] || order.drinkType) : order.drinkType}</p>
                  </div>
                  <StatusBadge status={order.status} lang={lang} />
                </div>
                <div className="flex gap-2">
                  {order.status === 'accepted' ? (
                    <button 
                      onClick={() => updateStatus(order.id, 'in_progress')}
                      className="flex-1 bg-brand-secondary hover:bg-brand-primary text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <PlayCircle size={18} /> {t.startMaking}
                    </button>
                  ) : (
                    <button 
                      onClick={() => updateStatus(order.id, 'completed')}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 size={18} /> {t.completeDeliver}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {activeOrders.length === 0 && (
              <div className="bg-white p-12 rounded-3xl border border-dashed border-neutral-200 text-center text-neutral-400">
                {t.noOrders}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminView({ profile, orders, settings, lang }: { profile: UserProfile, orders: Order[], settings: GlobalSettings | null, lang: Language }) {
  const t = translations[lang];
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newSettings, setNewSettings] = useState<GlobalSettings | null>(settings);
  const [adminTab, setAdminTab] = useState<'stats' | 'users' | 'logs'>('stats');

  useEffect(() => {
    const q = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'audit_logs');
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'users'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });
    return unsubscribe;
  }, []);

  const saveSettings = async () => {
    if (!newSettings) return;
    try {
      await setDoc(doc(db, 'settings', 'global'), newSettings);
      toast.success(lang === 'ar' ? "تم تحديث الإعدادات!" : "Settings updated!");
      setIsSettingsOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/global');
    }
  };

  const updateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      toast.success(lang === 'ar' ? `تم تحديث دور المستخدم إلى ${newRole}` : `User role updated to ${newRole}`);
      
      await addDoc(collection(db, 'audit_logs'), {
        action: 'role_updated',
        userId: profile.uid,
        userName: profile.displayName,
        timestamp: new Date().toISOString(),
        details: `Changed user ${userId} role to ${newRole}`
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
    }
  };

  // Stats Logic
  const stats = useMemo(() => {
    const total = orders.length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const cancelled = orders.filter(o => o.status === 'cancelled').length;
    
    const drinkCounts: Record<string, number> = {};
    orders.forEach(o => {
      drinkCounts[o.drinkType] = (drinkCounts[o.drinkType] || 0) + 1;
    });

    const chartData = Object.entries(drinkCounts).map(([name, value]) => ({ name, value }));
    
    return { total, completed, cancelled, chartData };
  }, [orders]);

  return (
    <div className="space-y-8">
      {/* Admin Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t.governance}</h2>
          <p className="text-neutral-500 text-sm">{lang === 'ar' ? 'إدارة الحوكمة والمستخدمين ومراقبة الأداء.' : 'Manage governance, users, and monitor performance.'}</p>
        </div>
        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="flex items-center gap-2 bg-brand-primary text-white px-6 py-3 rounded-2xl hover:bg-brand-secondary transition-all font-bold shadow-lg shadow-teal-900/10"
        >
          <SettingsIcon size={18} /> {t.settings}
        </button>
      </div>

      {/* Admin Tabs */}
      <div className="flex bg-white p-1 rounded-2xl border border-neutral-100 w-fit">
        <button 
          onClick={() => setAdminTab('stats')}
          className={cn("px-6 py-2 rounded-xl text-sm font-bold transition-all", adminTab === 'stats' ? "bg-teal-50 text-brand-primary" : "text-neutral-400 hover:text-neutral-600")}
        >
          {lang === 'ar' ? 'الإحصائيات' : 'Statistics'}
        </button>
        <button 
          onClick={() => setAdminTab('users')}
          className={cn("px-6 py-2 rounded-xl text-sm font-bold transition-all", adminTab === 'users' ? "bg-teal-50 text-brand-primary" : "text-neutral-400 hover:text-neutral-600")}
        >
          {lang === 'ar' ? 'المستخدمين' : 'Users'}
        </button>
        <button 
          onClick={() => setAdminTab('logs')}
          className={cn("px-6 py-2 rounded-xl text-sm font-bold transition-all", adminTab === 'logs' ? "bg-teal-50 text-brand-primary" : "text-neutral-400 hover:text-neutral-600")}
        >
          {lang === 'ar' ? 'السجلات' : 'Logs'}
        </button>
      </div>

      {/* Tab Content */}
      {adminTab === 'stats' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm">
              <p className="text-neutral-500 text-sm font-medium mb-1">{t.totalOrders}</p>
              <span className="text-3xl font-bold">{stats.total}</span>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm">
              <p className="text-neutral-500 text-sm font-medium mb-1">{t.completedOrders}</p>
              <span className="text-3xl font-bold text-green-600">{stats.completed}</span>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-neutral-100 shadow-sm">
              <p className="text-neutral-500 text-sm font-medium mb-1">{t.cancel}</p>
              <span className="text-3xl font-bold text-red-600">{stats.cancelled}</span>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm">
            <h3 className="text-lg font-bold mb-6">{lang === 'ar' ? 'توزيع المشروبات' : 'Drink Distribution'}</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.chartData}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" fill="#56A89A" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {adminTab === 'users' && (
        <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <table className="w-full text-left border-collapse">
            <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wider">
              <tr>
                <th className="p-4 font-bold">{t.employee}</th>
                <th className="p-4 font-bold">{lang === 'ar' ? 'الدور' : 'Role'}</th>
                <th className="p-4 font-bold">{t.dailyOrders}</th>
                <th className="p-4 font-bold">{lang === 'ar' ? 'إجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {users.map(u => (
                <tr key={u.uid} className="hover:bg-neutral-50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <img src={`https://ui-avatars.com/api/?name=${u.displayName}`} className="w-8 h-8 rounded-full" />
                      <div>
                        <p className="font-bold text-sm">{u.displayName}</p>
                        <p className="text-[10px] text-neutral-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <RoleBadge role={u.role} lang={lang} />
                  </td>
                  <td className="p-4 text-sm">
                    {u.dailyOrderCount} / {settings?.dailyLimit}
                  </td>
                  <td className="p-4">
                    <select 
                      value={u.role}
                      onChange={(e) => updateUserRole(u.uid, e.target.value as UserRole)}
                      className="text-xs bg-neutral-100 border-none rounded-lg p-1 focus:ring-1 focus:ring-brand-primary"
                    >
                      <option value="employee">{t.employee}</option>
                      <option value="office_boy">{lang === 'ar' ? 'عامل مكتب' : 'Office Boy'}</option>
                      <option value="admin">{t.admin}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adminTab === 'logs' && (
        <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden animate-in fade-in duration-300">
          <div className="divide-y divide-neutral-50">
            {logs.map(log => (
              <div key={log.id} className="p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-500">
                    <History size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{log.details}</p>
                    <p className="text-[10px] text-neutral-400">{log.userName} • {format(new Date(log.timestamp), 'MMM d, HH:mm')}</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-300">{log.action.replace('_', ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-neutral-100 flex justify-between items-center">
              <h2 className="text-xl font-bold">{t.settings}</h2>
              <button onClick={() => setIsSettingsOpen(false)} className="text-neutral-400 hover:text-neutral-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-2">{t.dailyLimit}</label>
                <input 
                  type="number" 
                  value={newSettings?.dailyLimit}
                  onChange={e => setNewSettings(prev => prev ? {...prev, dailyLimit: parseInt(e.target.value)} : null)}
                  className="w-full bg-neutral-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-neutral-700 mb-2">{t.slaMinutes} ({lang === 'ar' ? 'دقيقة' : 'minutes'})</label>
                <input 
                  type="number" 
                  value={newSettings?.slaMinutes}
                  onChange={e => setNewSettings(prev => prev ? {...prev, slaMinutes: parseInt(e.target.value)} : null)}
                  className="w-full bg-neutral-50 border-none rounded-xl p-3 focus:ring-2 focus:ring-brand-primary"
                />
              </div>
              <button 
                onClick={saveSettings}
                className="w-full bg-brand-primary hover:bg-brand-secondary text-white font-bold py-4 rounded-2xl shadow-lg shadow-teal-900/10 transition-all"
              >
                {t.saveSettings}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
