import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
export async function exportCsv(csv: string, name: string) {
  if (Capacitor.isNativePlatform()) {
    const path = "point-exports/" + name;
    const result = await Filesystem.writeFile({path,data:csv,directory:Directory.Cache,encoding:Encoding.UTF8,recursive:true});
    await Share.share({title:"战队积分统计",files:[result.uri],dialogTitle:"保存或导出积分表"});
    return;
  }
  const file = new File([csv], name, { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file), anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url),60000);
}
