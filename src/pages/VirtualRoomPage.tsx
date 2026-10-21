import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ExternalLink, Loader2, PhoneOff, Radio, Users } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { errMsg } from "@/components/students/QueryState";
import { useToast } from "@/hooks/use-toast";
import { rpc } from "@/lib/rpc";

interface Join { room: string; host: boolean; status: string; title: string; display_name: string }

// The video runs on Jitsi. meet.jit.si needs no account; set VITE_JITSI_DOMAIN to use your own or a paid Jitsi server.
const DOMAIN = (import.meta.env.VITE_JITSI_DOMAIN as string | undefined) || "meet.jit.si";

/** One live class. The room name comes from the server only for people allowed in. */
const VirtualRoomPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [j, setJ] = useState<Join | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    rpc<Join>("vclass_join", { _id: id }).then(setJ).catch((e) => setError(errMsg(e)));
    return () => { void rpc("vclass_heartbeat", { _id: id, _leaving: true }).catch(() => undefined); };
  }, [id]);

  // Keep attendance current, and notice when the teacher ends the class.
  useEffect(() => {
    if (!j) return;
    const t = setInterval(async () => {
      try {
        const st = await rpc<string>("vclass_heartbeat", { _id: id, _leaving: false });
        if (st === "ended" || st === "cancelled") { toast({ title: "The class has ended" }); navigate("/virtual-class"); }
      } catch { /* try again next beat */ }
    }, 30_000);
    const c = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [j, id, navigate, toast]);

  const end = async () => {
    if (!window.confirm("End the class for everyone?")) return;
    try { await rpc("vclass_set_status", { _id: id, _status: "ended" }); navigate("/virtual-class"); }
    catch (e) { toast({ title: "Not ended", description: errMsg(e), variant: "destructive" }); }
  };
  const leave = async () => { await rpc("vclass_heartbeat", { _id: id, _leaving: true }).catch(() => undefined); navigate("/virtual-class"); };

  const name = j ? encodeURIComponent(JSON.stringify(j.display_name)) : "";
  const src = j ? `https://${DOMAIN}/${j.room}#userInfo.displayName=${name}&config.prejoinPageEnabled=false&config.disableDeepLinking=true&interfaceConfig.SHOW_JITSI_WATERMARK=false` : "";
  const mm = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild><Link to="/virtual-class"><ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> Virtual Class</Link></Button>
        {j && <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 font-semibold text-destructive"><Radio className="h-4 w-4 animate-pulse" aria-hidden /> {j.status === "live" ? "Live" : "Waiting to start"}</span>
          <span className="font-medium">{j.title}</span><span className="tabular-nums text-muted-foreground">{mm}</span>
          <a href={`https://${DOMAIN}/${j.room}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Open in new window <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
        </div>}
      </div>
      {error && <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-card"><AlertTriangle className="mx-auto h-8 w-8 text-warning" aria-hidden /><p className="mt-3 font-medium">{error}</p><Button className="mt-4" asChild><Link to="/virtual-class">Back</Link></Button></div>}
      {!j && !error && <div className="flex h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Joining" /></div>}
      {j && (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-black shadow-elevated" style={{ height: "calc(100vh - 15rem)", minHeight: 420 }}>
            <iframe title={`Live class: ${j.title}`} src={src} allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write" className="h-full w-full border-0" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" aria-hidden /> Use the controls in the video to mute, share your screen, raise your hand and chat.</p>
            {j.host ? <Button variant="destructive" onClick={end}><PhoneOff className="mr-1 h-4 w-4" aria-hidden /> End Class</Button> : <Button variant="outline" onClick={leave}><PhoneOff className="mr-1 h-4 w-4" aria-hidden /> Leave</Button>}
          </div>
        </>
      )}
    </DashboardLayout>
  );
};

export default VirtualRoomPage;
