import { Lock, MapPinOff } from "lucide-react";
import { Button, EmptyState } from "@jc/ui";
import { go } from "../lib";

export function NoAccess({ missing }: { missing?: boolean }) {
  return missing ? (
    <EmptyState icon={<MapPinOff />} title="هذه الصفحة غير موجودة" body="ربما تغيّر الرابط. ارجع للرئيسية أو استخدم البحث (Ctrl K)." action={<Button onClick={() => go("/")}>الرئيسية</Button>} />
  ) : (
    <EmptyState icon={<Lock />} title="هذه الصفحة للإدارة فقط" body="حسابك (مهندس) لا يملك صلاحية فتحها. لو تحتاجها في شغلك اطلب من الإدارة." action={<Button onClick={() => go("/")}>الرئيسية</Button>} />
  );
}
