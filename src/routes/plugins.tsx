import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/plugins")({ component: PluginsLayout })

function PluginsLayout() {
  return (
    <div className="page-body">
      <Outlet />
    </div>
  )
}
