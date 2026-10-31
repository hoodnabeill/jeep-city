import { useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Avatar, Button, Field, Input } from "@jc/ui";
import { ApiError, isAppShell, recentUsers, serverList, setServerList } from "../data/api";
import { go, useSession } from "../lib";

export function Login({ switching }: { switching?: boolean }) {
  const { user, signIn } = useSession();
  const recent = recentUsers();
  const [username, setUsername] = useState(switching ? "" : recent[0]?.username ?? "");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<{ u?: string; p?: string }>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err: typeof error = {};
    if (!username.trim()) err.u = "اكتب اسم المستخدم.";
    if (!password) err.p = "اكتب كلمة المرور.";
    setError(err);
    if (err.u || err.p) return;
    setBusy(true);
    try {
      await signIn(username.trim(), password);
      go("/");
    } catch (x) {
      setError({ p: x instanceof ApiError ? x.message : "تعذر تسجيل الدخول. حاول مرة أخرى." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login__brand" aria-hidden>
        <img src="/brand/badge-colour.svg" alt="" width={300} height={300} />
        <div>
          <h2>كل سيارة، كل قطعة، كل جنيه. في مكان واحد.</h2>
          <p>نظام إدارة ورشة Jeep City</p>
        </div>
        <span className="login__place">EL REHAB · NEW CAIRO</span>
      </section>
      <form className="login__form" onSubmit={submit} noValidate>
        <div>
          <h1>{switching ? "تبديل المستخدم" : "تسجيل الدخول"}</h1>
          {switching && user && <p className="hint-line" style={{ marginTop: 6 }}>جلسة {user.name} مقفولة. أي عمل غير محفوظ يبقى كمسودة على هذا الجهاز.</p>}
        </div>
        {recent.length > 0 && <div className="field">
          <span className="field__label">استخدموا هذا الجهاز مؤخرًا</span>
          <div className="login__users">
            {recent.slice(0, 3).map((u) => (
              <button key={u.username} type="button" className="login__user" aria-pressed={username === u.username}
                onClick={() => { setUsername(u.username); setError({}); document.getElementById("pw")?.focus(); }}>
                <Avatar name={u.name} size="lg" dark={u.role === "admin"} />
                <b>{u.name}</b><span>{u.role === "admin" ? "إدارة" : "مهندس"}</span>
              </button>
            ))}
          </div>
        </div>}
        <Field label="اسم المستخدم" htmlFor="un" error={error.u}>
          <Input id="un" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" dir="ltr" style={{ textAlign: "right" }} />
        </Field>
        <Field label="كلمة المرور" htmlFor="pw" error={error.p}>
          <div className="input-group">
            <LockKeyhole />
            <Input id="pw" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus={switching} />
            <span className="input-group__end">
              <button type="button" className="icon-btn icon-btn--sm" aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"} onClick={() => setShow(!show)}>{show ? <EyeOff /> : <Eye />}</button>
            </span>
          </div>
        </Field>
        <Button type="submit" variant="primary" size="lg" block disabled={busy}>{busy ? "جاري الدخول…" : "دخول"}</Button>
        <p className="hint-line">نسيت كلمة المرور؟ اطلب من الإدارة تعيين كلمة جديدة من الإعدادات ← المستخدمون.</p>
        {isAppShell && <ServerAddresses />}
      </form>
    </div>
  );
}

/** Windows and phone apps only: the server's shop-network address, then the tunnel address used outside (D-88). */
function ServerAddresses() {
  const [open, setOpen] = useState(false);
  const [lan, setLan] = useState(serverList()[0] ?? "");
  const [out, setOut] = useState(serverList()[1] ?? "");
  const [saved, setSaved] = useState(false);
  if (!open) return <button type="button" className="link" style={{ border: 0, background: "none", padding: 0 }} onClick={() => setOpen(true)}>عنوان الخادم</button>;
  return (
    <div className="stack" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <Field label="عنوان الخادم داخل المحل" hint="مثال: http://192.168.1.10/api"><Input className="lat" dir="ltr" value={lan} onChange={(e) => { setLan(e.target.value); setSaved(false); }} /></Field>
      <Field label="عنوان الخادم من خارج المحل" hint="مثال: https://jc.example.com/api"><Input className="lat" dir="ltr" value={out} onChange={(e) => { setOut(e.target.value); setSaved(false); }} /></Field>
      <Button onClick={() => { setServerList([lan, out].filter((x) => /^https?:\/\//.test(x.trim()))); setSaved(true); }}>حفظ العناوين</Button>
      {saved && <p className="hint-line">تم الحفظ. يجرب التطبيق عنوان المحل أولًا ثم العنوان الخارجي.</p>}
    </div>
  );
}
