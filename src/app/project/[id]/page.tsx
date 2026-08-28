import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getProject } from "@/lib/store";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: Props) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const session = await auth();

  return (
    <ProjectWorkspace
      initialProject={project}
      isLoggedIn={Boolean(session?.user?.id)}
    />
  );
}
