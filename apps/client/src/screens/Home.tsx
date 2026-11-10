import { ArrowLeft } from "lucide-react";
import { useFmt } from "@jc/ui";
import { Link, useSession } from "../lib";
import { useApi } from "../data/hooks";
import type { WorkOrderRow } from "../data/types";
import { visibleNav, visibleSections } from "../shell/sections";

/** The start page: one tile per section the user may open. */
export function Home() {
  const { user } = useSession();
  const f = useFmt();
  const inShop = useApi<WorkOrderRow[]>("/work-orders?status=in_shop").data?.length ?? 0;
  return (
    <div className="home">
      <h1 className="home__hello">أهلًا {user?.name.split(" ")[0]}</h1>
      <div className="home__tiles">
        {visibleSections(user).map((s) => {
          const nav = visibleNav(s, user);
          return (
            <Link key={s.id} to={nav[0].to} className="home-tile">
              <span className="home-tile__icon"><s.icon aria-hidden /></span>
              <span className="home-tile__title">{s.label}</span>
              <span className="home-tile__sub">{s.id === "reception" && inShop > 0 ? `${f.n(inShop)} سيارة في الورشة الآن · ` : ""}{s.sub}</span>
              <span className="home-tile__go"><ArrowLeft aria-hidden /></span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
