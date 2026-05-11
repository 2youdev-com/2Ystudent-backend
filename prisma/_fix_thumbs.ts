import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // Update all course thumbnails from maxresdefault to hqdefault
  const courses = await prisma.course.findMany({ select: { id: true, thumbnailUrl: true, lectures: { select: { videoUrl: true }, orderBy: { orderInCourse: 'asc' }, take: 1 } } });

  for (const course of courses) {
    // Use the first lesson's video for thumbnail
    const firstVideo = course.lectures[0]?.videoUrl;
    if (!firstVideo) continue;

    // Extract YouTube video ID
    const match = firstVideo.match(/(?:watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) continue;

    const videoId = match[1];
    const newThumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    await prisma.course.update({
      where: { id: course.id },
      data: { thumbnailUrl: newThumb },
    });
    console.log(`✓ ${course.id} → ${videoId}`);
  }

  await prisma.$disconnect();
}
main();
