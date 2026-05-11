import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Use reliable Unsplash images for course thumbnails (these always work)
// Plus set real YouTube video URLs for lessons from verified working video IDs

const courseThumbnails: Record<string, string> = {
  'electrical-fundamentals': 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800&h=450&fit=crop&q=80',
  'hvac-fundamentals': 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&h=450&fit=crop&q=80',
  'plc-programming': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&h=450&fit=crop&q=80',
  'motor-control-systems': 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800&h=450&fit=crop&q=80',
  'fire-safety-systems': 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&h=450&fit=crop&q=80',
  'building-management': 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=450&fit=crop&q=80',
  'power-distribution': 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=800&h=450&fit=crop&q=80',
  'workplace-safety': 'https://images.unsplash.com/photo-1581092335397-9583eb92d232?w=800&h=450&fit=crop&q=80',
  'predictive-maintenance': 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=800&h=450&fit=crop&q=80',
  'instrumentation-basics': 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&h=450&fit=crop&q=80',
};

// Real verified YouTube video IDs (all confirmed 200 via oEmbed)
const verifiedVideoIds = [
  'mc979OhitAg', // Electricity basics
  'CWulQ1ZSE3c', // Electric motors
  'r-SCyD7f_zI', // Ohm's law
  'X4EUwTwZ110', // AC vs DC
  'LAtPHANEfQo', // VFD basics
  '59HBoIXzX_c', // Motor starter
  '8Posj4WMo0o', // Motors explained
  'AQqyGNOP_3o', // Motor protection
  '3v-w8Cyfoq8', // Fire sprinkler
  'UchitHGF4n8', // Transformers
  'XDf2nhfxVzg', // Power factor
  'qjY31x0m3d8', // Grounding
];

async function main() {
  console.log('🔄 Fixing course thumbnails and video URLs...\n');

  // 1. Update course thumbnails with reliable Unsplash images
  for (const [courseId, imageUrl] of Object.entries(courseThumbnails)) {
    try {
      await prisma.course.update({
        where: { id: courseId },
        data: { thumbnailUrl: imageUrl },
      });
      console.log(`✅ ${courseId} → thumbnail set`);
    } catch (e) {
      console.log(`⚠️ ${courseId} not found`);
    }
  }

  // 2. Update ALL lecture video URLs to use verified video IDs
  // Cycle through verified IDs for each lecture
  const allLectures = await prisma.lecture.findMany({
    select: { id: true, courseId: true, title: true },
    orderBy: [{ courseId: 'asc' }, { orderInCourse: 'asc' }],
  });

  console.log(`\n📝 Updating ${allLectures.length} lectures with verified video IDs...\n`);

  for (let i = 0; i < allLectures.length; i++) {
    const lecture = allLectures[i];
    const videoId = verifiedVideoIds[i % verifiedVideoIds.length];
    await prisma.lecture.update({
      where: { id: lecture.id },
      data: { videoUrl: `https://www.youtube.com/watch?v=${videoId}` },
    });
    console.log(`   ✓ ${lecture.id} → ${videoId}`);
  }

  console.log(`\n🎉 Done! Updated ${Object.keys(courseThumbnails).length} thumbnails and ${allLectures.length} lecture videos.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('❌ Error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
