import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Mail, MessageCircle, MapPin, ArrowLeft, Send, Loader2 } from 'lucide-react';
import ThemeToggle from '../../components/ui/ThemeToggle';
import toast from 'react-hot-toast';

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error('Veuillez remplir tous les champs obligatoires.');
      return;
    }
    setLoading(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contact-form`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Erreur lors de l'envoi");
      toast.success('Message envoyé ! Nous vous répondrons sous 48h.');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      toast.error("Erreur lors de l'envoi. Vous pouvez aussi nous écrire directement à support@liafrik.com");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-surface-0">
      <nav className="sticky top-0 z-50 bg-white/80 dark:bg-surface-1/80 backdrop-blur-md border-b border-gray-100 dark:border-surface-3">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-[#10B981]" />
            <span className="font-bold text-lg text-gray-900 dark:text-white">Li<span className="text-[#10B981]">Books</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle variant="subtle" />
            <Link to="/" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Accueil</span>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">Contactez-nous</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-10">
          Une question, un besoin spécifique, ou simplement envie d'échanger ? Notre équipe vous répond sous 48h.
        </p>

        {/* Contact channels */}
        <div className="grid sm:grid-cols-2 gap-4 mb-10">
          <a href="mailto:info@liafrik.com" className="flex items-start gap-3 p-5 bg-gray-50 dark:bg-surface-1 rounded-xl border border-gray-100 dark:border-surface-3 hover:border-[#10B981] transition-colors">
            <div className="w-10 h-10 bg-[#10B981]/10 dark:bg-[#10B981]/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Mail className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Informations générales</h3>
              <p className="text-sm text-[#10B981] mt-0.5">info@liafrik.com</p>
              <p className="text-xs text-gray-400 mt-1">Partenariats, presse, questions produit</p>
            </div>
          </a>
          <a href="mailto:support@liafrik.com" className="flex items-start gap-3 p-5 bg-gray-50 dark:bg-surface-1 rounded-xl border border-gray-100 dark:border-surface-3 hover:border-[#10B981] transition-colors">
            <div className="w-10 h-10 bg-[#10B981]/10 dark:bg-[#10B981]/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-[#10B981]" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Support technique</h3>
              <p className="text-sm text-[#10B981] mt-0.5">support@liafrik.com</p>
              <p className="text-xs text-gray-400 mt-1">Bug, configuration, aide d'utilisation</p>
            </div>
          </a>
        </div>

        {/* Locations */}
        <div className="flex flex-col sm:flex-row gap-4 mb-10">
          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-surface-1 rounded-xl border border-gray-100 dark:border-surface-3 flex-1">
            <MapPin className="w-5 h-5 text-[#10B981] flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Dubaï, EAU</p>
              <p className="text-xs text-gray-400">Innovation & développement</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-surface-1 rounded-xl border border-gray-100 dark:border-surface-3 flex-1">
            <MapPin className="w-5 h-5 text-[#10B981] flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Yaoundé, Cameroun</p>
              <p className="text-xs text-gray-400">Ancrage africain & support terrain</p>
            </div>
          </div>
        </div>

        {/* Contact form */}
        <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-surface-1 rounded-2xl border border-gray-100 dark:border-surface-3 p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Envoyez-nous un message</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sujet</label>
            <input value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message *</label>
            <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} rows={5}
              className="w-full px-3 py-2.5 border border-gray-300 dark:border-surface-3 dark:bg-surface-2 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#10B981] resize-none" />
          </div>
          <button type="submit" disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#10B981] hover:bg-[#0d9e6e] text-white font-semibold rounded-xl text-sm disabled:opacity-60 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {loading ? 'Envoi...' : 'Envoyer le message'}
          </button>
        </form>
      </div>

      <footer className="border-t border-gray-100 dark:border-surface-3 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <p className="text-sm text-gray-400">
            LiBooks est développé par <span className="font-bold text-gray-600 dark:text-gray-300">LIYAH GROUP</span> — Dubaï & Yaoundé
          </p>
          <p className="text-xs text-gray-400 mt-1">© 2026 LIYAH GROUP. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
