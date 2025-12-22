import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, Client, ActionRowBuilder, ButtonBuilder, ButtonStyle, ButtonInteraction, ComponentType } from 'discord.js';
import { getFooterText } from '../../settings/bot.js';

// GraphQL query untuk mencari anime berdasarkan judul dengan pagination
const ANIME_SEARCH_QUERY = `
query ($search: String, $page: Int, $perPage: Int) {
  Page (page: $page, perPage: $perPage) {
    pageInfo {
      total
      currentPage
      lastPage
      hasNextPage
      perPage
    }
    media (search: $search, type: ANIME) {
      id
      title {
        romaji
        english
        native
      }
      description
      format
      status
      episodes
      duration
      startDate {
        year
        month
        day
      }
      endDate {
        year
        month
        day
      }
      season
      seasonYear
      averageScore
      meanScore
      popularity
      favourites
      studios {
        nodes {
          name
        }
      }
      genres
      tags {
        name
        rank
      }
      coverImage {
        large
        extraLarge
      }
      bannerImage
      siteUrl
    }
  }
}
`;

// Store untuk menyimpan hasil pencarian per user
const searchResultsCache = new Map<string, {
    allResults: any[];
    totalResults: number;
    searchQuery: string;
    timestamp: number;
}>();

// Cleanup cache setelah 5 menit
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of searchResultsCache.entries()) {
        if (now - value.timestamp > 300000) { // 5 minutes
            searchResultsCache.delete(key);
        }
    }
}, 60000); // Check every minute

// Fetch all pages of results
async function fetchAllAnimeResults(title: string, maxResults: number = 50): Promise<any[]> {
    const allResults: any[] = [];
    let currentPage = 1;
    let hasNextPage = true;

    while (hasNextPage && allResults.length < maxResults) {
        try {
            const result = await searchAnime(title, currentPage, 10);
            if (result.errors || !result.data || !result.data.Page) {
                break;
            }

            const media = result.data.Page.media;
            if (media.length === 0) {
                break;
            }

            allResults.push(...media);
            hasNextPage = result.data.Page.pageInfo.hasNextPage;
            currentPage++;

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            console.error('[ANIME] Error fetching page:', error);
            break;
        }
    }

    return allResults.slice(0, maxResults);
}

interface AniListResponse {
    data: {
        Page: {
            pageInfo: {
                total: number;
                currentPage: number;
                lastPage: number;
                hasNextPage: boolean;
                perPage: number;
            };
            media: Array<{
                id: number;
                title: {
                    romaji: string;
                    english: string | null;
                    native: string;
                };
                description: string | null;
                format: string;
                status: string;
                episodes: number | null;
                duration: number | null;
                startDate: {
                    year: number | null;
                    month: number | null;
                    day: number | null;
                };
                endDate: {
                    year: number | null;
                    month: number | null;
                    day: number | null;
                };
                season: string | null;
                seasonYear: number | null;
                averageScore: number | null;
                meanScore: number | null;
                popularity: number | null;
                favourites: number;
                studios: {
                    nodes: Array<{ name: string }>;
                };
                genres: string[];
                tags: Array<{ name: string; rank: number }>;
                coverImage: {
                    large: string;
                    extraLarge: string;
                };
                bannerImage: string | null;
                siteUrl: string;
            }>;
        };
    };
    errors?: Array<{ message: string }>;
}

function formatDate(date: { year: number | null; month: number | null; day: number | null }): string {
    if (!date.year) return 'TBA';
    const month = date.month ? String(date.month).padStart(2, '0') : '??';
    const day = date.day ? String(date.day).padStart(2, '0') : '??';
    return `${date.year}-${month}-${day}`;
}

function formatStatus(status: string): string {
    const statusMap: { [key: string]: string } = {
        'FINISHED': 'Selesai',
        'RELEASING': 'Tayang',
        'NOT_YET_RELEASED': 'Belum Rilis',
        'CANCELLED': 'Dibatalkan',
        'HIATUS': 'Ditunda'
    };
    return statusMap[status] || status;
}

function formatType(format: string): string {
    const formatMap: { [key: string]: string } = {
        'TV': 'TV Series',
        'TV_SHORT': 'TV Short',
        'MOVIE': 'Movie',
        'SPECIAL': 'Special',
        'OVA': 'OVA',
        'ONA': 'ONA',
        'MUSIC': 'Music',
        'MANGA': 'Manga'
    };
    return formatMap[format] || format;
}

function cleanDescription(description: string | null): string {
    if (!description) return 'Tidak ada deskripsi';
    // Remove HTML tags
    let cleaned = description.replace(/<[^>]*>/g, '');
    // Remove markdown links
    cleaned = cleaned.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    // Limit length
    if (cleaned.length > 1000) {
        cleaned = cleaned.substring(0, 997) + '...';
    }
    return cleaned;
}

function createAnimeEmbed(anime: any, currentPage: number, totalPages: number): EmbedBuilder {
    // Build title display
    const titles: string[] = [];
    if (anime.title.romaji) titles.push(`**Romaji:** ${anime.title.romaji}`);
    if (anime.title.english) titles.push(`**English:** ${anime.title.english}`);
    if (anime.title.native) titles.push(`**Native:** ${anime.title.native}`);
    const titleDisplay = titles.join('\n') || 'Tidak ada judul';

    // Build date range
    const startDate = formatDate(anime.startDate);
    const endDate = anime.endDate.year ? formatDate(anime.endDate) : 'Ongoing';
    const dateRange = `${startDate} - ${endDate}`;

    // Build season info
    let seasonInfo = '';
    if (anime.season && anime.seasonYear) {
        const seasonNames: { [key: string]: string } = {
            'WINTER': 'Musim Dingin',
            'SPRING': 'Musim Semi',
            'SUMMER': 'Musim Panas',
            'FALL': 'Musim Gugur'
        };
        seasonInfo = `${seasonNames[anime.season] || anime.season} ${anime.seasonYear}`;
    }

    // Build studios
    const studios = anime.studios.nodes.length > 0
        ? anime.studios.nodes.map((s: any) => s.name).join(', ')
        : 'Tidak diketahui';

    // Build genres (limit to 10) - dengan backticks
    const genres = anime.genres.length > 0
        ? anime.genres.slice(0, 10).map((g: string) => `\`${g}\``).join(', ')
        : 'Tidak ada genre';

    // Build top tags (top 5 by rank) - dengan backticks
    const topTags = anime.tags
        .sort((a: any, b: any) => b.rank - a.rank)
        .slice(0, 5)
        .map((t: any) => `\`${t.name}\``)
        .join(', ');

    // Build episodes info
    let episodesInfo = '';
    if (anime.episodes) {
        episodesInfo = `${anime.episodes} episode`;
        if (anime.duration) {
            episodesInfo += ` (${anime.duration} menit/episode)`;
        }
    } else {
        episodesInfo = 'TBA';
    }

    // Build score info
    let scoreInfo = '';
    if (anime.averageScore) {
        scoreInfo = `⭐ ${anime.averageScore}/100`;
    } else if (anime.meanScore) {
        scoreInfo = `⭐ ${anime.meanScore}/100`;
    } else {
        scoreInfo = 'Belum ada rating';
    }

    // Create embed
    const embed = new EmbedBuilder()
        .setTitle(anime.title.romaji || anime.title.english || anime.title.native)
        .setDescription(cleanDescription(anime.description))
        .setColor(0x02A9FF) // AniList blue color
        .setThumbnail(anime.coverImage.large || anime.coverImage.extraLarge || null)
        .setImage(anime.bannerImage || null)
        .addFields(
            {
                name: '📝 Judul',
                value: titleDisplay,
                inline: false
            },
            {
                name: '📊 Format',
                value: formatType(anime.format),
                inline: true
            },
            {
                name: '📺 Status',
                value: formatStatus(anime.status),
                inline: true
            },
            {
                name: '🎬 Episode',
                value: episodesInfo,
                inline: true
            },
            {
                name: '📅 Tanggal Rilis',
                value: dateRange,
                inline: true
            },
            {
                name: '🗓️ Season',
                value: seasonInfo || 'Tidak diketahui',
                inline: true
            },
            {
                name: '⭐ Rating',
                value: scoreInfo,
                inline: true
            },
            {
                name: '👥 Popularitas',
                value: anime.popularity ? `${anime.popularity.toLocaleString()} pengguna` : 'Tidak diketahui',
                inline: true
            },
            {
                name: '❤️ Favorit',
                value: `${anime.favourites.toLocaleString()} pengguna`,
                inline: true
            },
            {
                name: '🏢 Studio',
                value: studios,
                inline: false
            },
            {
                name: '🏷️ Genre',
                value: genres,
                inline: false
            }
        )
        .setTimestamp()
        .setFooter({
            text: getFooterText(`AniList ID: ${anime.id} | Halaman ${currentPage}/${totalPages}`),
            iconURL: undefined
        });

    // Add tags if available
    if (topTags) {
        embed.addFields({
            name: '🔖 Tags Populer',
            value: topTags,
            inline: false
        });
    }

    return embed;
}

async function searchAnime(title: string, page: number = 1, perPage: number = 10): Promise<AniListResponse> {
    const url = 'https://graphql.anilist.co';
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        body: JSON.stringify({
            query: ANIME_SEARCH_QUERY,
            variables: {
                search: title,
                page: page,
                perPage: perPage
            }
        })
    };

    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json() as AniListResponse;
}

export default {
    category: 'anime',
    data: new SlashCommandBuilder()
        .setName('anime')
        .setDescription('Menampilkan informasi lengkap tentang anime dari AniList')
        .addStringOption(option =>
            option
                .setName('judul')
                .setDescription('Judul anime yang ingin dicari')
                .setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        await interaction.deferReply();

        const title = interaction.options.getString('judul', true);

        try {

            // Fetch all results (up to 50)
            const processingEmbed = new EmbedBuilder()
                .setTitle('🔍 Mencari Anime...')
                .setDescription(`**Sedang mencari anime:** \`${title}\`\n\nMohon tunggu sebentar...`)
                .setColor(0x02A9FF)
                .setTimestamp();

            await interaction.editReply({ embeds: [processingEmbed] });

            const allResults = await fetchAllAnimeResults(title, 50);
            
            if (allResults.length === 0) {
                const notFoundEmbed = new EmbedBuilder()
                    .setTitle('❌ Anime Tidak Ditemukan')
                    .setDescription(`**Tidak ada anime yang ditemukan dengan judul:**\n\n\`${title}\`\n\n**Tips:**\n• Pastikan ejaan judul benar\n• Coba gunakan judul bahasa Inggris atau Jepang\n• Gunakan judul yang lebih spesifik`)
                    .setColor(0xFFA500)
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                        iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                await interaction.editReply({ embeds: [notFoundEmbed] });
                return;
            }

            const totalResults = allResults.length;
            const currentIndex = 0;

            // Simpan hasil pencarian ke cache
            // Gunakan format cacheKey yang lebih sederhana tanpa underscore di timestamp
            const timestamp = Date.now();
            const cacheKey = `${interaction.user.id}-${timestamp}`;
            searchResultsCache.set(cacheKey, {
                allResults: allResults,
                totalResults: totalResults,
                searchQuery: title,
                timestamp: timestamp
            });

            // Tampilkan anime pertama
            const anime = allResults[currentIndex];
            const embed = createAnimeEmbed(anime, currentIndex + 1, totalResults);
            embed.setFooter({
                text: getFooterText(`AniList ID: ${anime.id} | Halaman ${currentIndex + 1}/${totalResults} | Diminta oleh ${interaction.user.tag}`),
                iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
            });

            // Create buttons - format: anime_prev_<cacheKey>_<index>
            const row = new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`anime_prev_${cacheKey}_${currentIndex}`)
                        .setLabel('◀️ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentIndex === 0),
                    new ButtonBuilder()
                        .setCustomId(`anime_next_${cacheKey}_${currentIndex}`)
                        .setLabel('Next ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(currentIndex >= totalResults - 1),
                    new ButtonBuilder()
                        .setLabel('Lihat di AniList')
                        .setStyle(ButtonStyle.Link)
                        .setURL(anime.siteUrl)
                        .setEmoji('🔗')
                );

            const response = await interaction.editReply({ embeds: [embed], components: [row] });

            // Create collector for button interactions
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: (i: ButtonInteraction) => 
                    i.user.id === interaction.user.id && 
                    (i.customId.startsWith(`anime_prev_${cacheKey}`) || i.customId.startsWith(`anime_next_${cacheKey}`)),
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (i: ButtonInteraction) => {
                await i.deferUpdate();

                // Parse customId: format is "anime_prev_<cacheKey>_<index>" or "anime_next_<cacheKey>_<index>"
                // cacheKey format: "<userId>-<timestamp>" (using dash, not underscore)
                // Index is always the LAST part after splitting by underscore
                const customIdParts = i.customId.split('_');
                if (customIdParts.length < 4) {
                    await i.editReply({ 
                        content: '❌ Format button tidak valid. Silakan gunakan command `/anime` lagi.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                const action = customIdParts[1]; // 'prev' or 'next'
                // Index is the last part
                const indexStr = customIdParts[customIdParts.length - 1];
                let currentIndex = parseInt(indexStr);
                
                // Reconstruct cacheKey: everything between action and index
                // Format: anime_prev_<userId>-<timestamp>_<index>
                // So cacheKey is parts[2] (since we use dash in cacheKey, not underscore)
                const extractedCacheKey = customIdParts[2];

                if (isNaN(currentIndex)) {
                    await i.editReply({ 
                        content: '❌ Index tidak valid. Silakan gunakan command `/anime` lagi.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                const cached = searchResultsCache.get(extractedCacheKey);
                if (!cached) {
                    await i.editReply({ 
                        content: '❌ Session pencarian telah kedaluwarsa. Silakan gunakan command `/anime` lagi.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                // Update index based on action
                if (action === 'prev') {
                    currentIndex = Math.max(0, currentIndex - 1);
                } else if (action === 'next') {
                    currentIndex = Math.min(cached.totalResults - 1, currentIndex + 1);
                } else {
                    await i.editReply({ 
                        content: '❌ Action tidak valid.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                // Get anime for current index
                const currentAnime = cached.allResults[currentIndex];
                if (!currentAnime) {
                    await i.editReply({ 
                        content: '❌ Tidak ada hasil untuk halaman ini.',
                        embeds: [],
                        components: []
                    });
                    return;
                }

                const newEmbed = createAnimeEmbed(currentAnime, currentIndex + 1, cached.totalResults);
                newEmbed.setFooter({
                    text: getFooterText(`AniList ID: ${currentAnime.id} | Halaman ${currentIndex + 1}/${cached.totalResults} | Diminta oleh ${i.user.tag}`),
                    iconURL: i.user.displayAvatarURL({ forceStatic: false }) || undefined
                });

                const newRow = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`anime_prev_${extractedCacheKey}_${currentIndex}`)
                            .setLabel('◀️ Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentIndex === 0),
                        new ButtonBuilder()
                            .setCustomId(`anime_next_${extractedCacheKey}_${currentIndex}`)
                            .setLabel('Next ▶️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentIndex >= cached.totalResults - 1),
                        new ButtonBuilder()
                            .setLabel('Lihat di AniList')
                            .setStyle(ButtonStyle.Link)
                            .setURL(currentAnime.siteUrl)
                            .setEmoji('🔗')
                    );

                await i.editReply({ embeds: [newEmbed], components: [newRow] });
            });

            collector.on('end', async () => {
                // Cleanup cache when collector ends
                searchResultsCache.delete(cacheKey);
            });

        } catch (error: any) {
            console.error('[ANIME] Error:', error);

            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error')
                .setDescription(`**Terjadi kesalahan saat mencari anime:**\n\n\`\`\`${error.message || 'Unknown error'}\`\`\``)
                .setColor(0xFF0000)
                .addFields({
                    name: '💡 Tips',
                    value: '• Pastikan koneksi internet stabil\n• Coba lagi dalam beberapa saat\n• Pastikan judul yang dimasukkan valid',
                    inline: false
                })
                .setTimestamp()
                .setFooter({
                    text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                    iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                });

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};

