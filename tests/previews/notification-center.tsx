import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { NotificationCenter } from "../../src/NotificationCenter";
import type { GameClient } from "../../src/game-client";
import "../../src/styles.css";
import "../../src/classic.css";

function Preview() {
  const [account, setAccount] = useState("member-a");
  const [lobby, setLobby] = useState(!location.search.includes("inGame=1"));
  const [idle, setIdle] = useState(!location.search.includes("inGame=1"));
  const [request, setRequest] = useState(0),
    [updateRequest, setUpdateRequest] = useState(0);
  const [refresh, setRefresh] = useState(0),
    [unread, setUnread] = useState(0),
    [notice, setNotice] = useState("");
  const client = useMemo(
    () =>
      ({
        api: async (path: string, body?: unknown) => {
          const response = await fetch(
            `/notification-fixture/${account}${path}`,
            {
              method: body === undefined ? "GET" : "POST",
              headers: { "Content-Type": "application/json" },
              body: body === undefined ? undefined : JSON.stringify(body),
            },
          );
          const data = await response.json();
          if (!response.ok)
            throw Object.assign(new Error(data.error), {
              status: response.status,
            });
          return data;
        },
      }) as unknown as GameClient,
    [account],
  );
  useEffect(() => {
    (window as any).__notificationFixture = {
      setAccount,
      refresh: () => setRefresh((value) => value + 1),
      inGame: (value: boolean) => {
        setLobby(!value);
        setIdle(!value);
      },
      openAnnouncements: () => setRequest((value) => value + 1),
      checkUpdates: () => setUpdateRequest((value) => value + 1),
    };
  }, []);
  return (
    <div className="app classic">
      <p data-testid="account">{account}</p>
      <p data-testid="unread">{unread}</p>
      <p data-testid="notice">{notice}</p>
      <NotificationCenter
        key={account}
        client={client}
        accountId={account}
        lobby={lobby}
        idle={idle}
        announcementRequest={request}
        updateRequest={updateRequest}
        refreshKey={refresh}
        onUnreadChange={setUnread}
        notice={setNotice}
      />
    </div>
  );
}
const root = createRoot(document.getElementById("root")!);
root.render(<Preview />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
