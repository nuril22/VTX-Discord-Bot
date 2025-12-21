import {
    SlashCommandBuilder,
    EmbedBuilder,
    ChatInputCommandInteraction,
    Client,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    MessageFlags,
} from 'discord.js';
import { 
    setTicketConfig, 
    getTicketConfig, 
    createTicket, 
    getUserTickets, 
    getTicketByChannel, 
    closeTicket, 
    deleteTicket, 
    removeTicketMember,
    getTicketMembers
} from '../../database/db.js';
import { getFooterText } from '../../settings/bot.js';

export default {
    category: 'ticket',
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Sistem ticket')
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Setup channel dan role untuk ticket system (mod only)')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('Channel untuk mengirim embed ticket')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('Role yang akan di-tag saat ticket dibuka (opsional)')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('deskripsi')
                        .setDescription('Deskripsi untuk embed ticket (opsional)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Buat ticket baru')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('close')
                .setDescription('Tutup ticket saat ini')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Hapus ticket saat ini (staff only)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Hapus user dari ticket')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('User yang akan dihapus dari ticket')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    async execute(interaction: ChatInputCommandInteraction, client: Client) {
        const subcommand = interaction.options.getSubcommand();

        // Setup subcommand
        if (subcommand === 'setup') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Check permissions
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Anda tidak memiliki permission untuk menggunakan command ini!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            const channel = interaction.options.getChannel('channel', true);
            const role = interaction.options.getRole('role');
            const description = interaction.options.getString('deskripsi');

            try {
                // Save config to database
                setTicketConfig(
                    interaction.guildId!,
                    channel.id,
                    role?.id,
                    description || null
                );

                // Create embed for ticket
                const defaultDescription = description || 
                    'Buka ticket dengan cara klick button dibawah lalu tag admin atau owner yang sedang online ✅\n\n❗ Harap jangan spam tag jika belum di respon';

                const embed = new EmbedBuilder()
                    .setTitle('🎫 CREATE A YOUR TICKET')
                    .setDescription(defaultDescription)
                    .setColor(0xFFD700)
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(),
                        iconURL: client.user?.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                // Create button
                const createButton = new ButtonBuilder()
                    .setCustomId('ticket_create')
                    .setLabel('Create Ticket')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎟️');

                const row = new ActionRowBuilder<ButtonBuilder>()
                    .addComponents(createButton);

                // Send embed to channel
                const ticketChannel = await interaction.guild?.channels.fetch(channel.id);
                if (ticketChannel && ticketChannel.isTextBased()) {
                    await ticketChannel.send({ embeds: [embed], components: [row] });
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Ticket System Setup Berhasil')
                    .setDescription(`Ticket system telah diatur!\n\n**Channel:** ${channel}\n${role ? `**Role:** ${role}\n` : ''}**Deskripsi:** ${description || 'Default'}`)
                    .setColor(0x00FF00)
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });
            } catch (error: any) {
                console.error('[TICKET] Error setting up ticket:', error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Gagal setup ticket system: ${error.message}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [errorEmbed] });
            }
            return;
        }

        // Create subcommand
        if (subcommand === 'create') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guild = interaction.guild;
            if (!guild) {
                return interaction.editReply({ content: '❌ Command ini hanya bisa digunakan di server!' });
            }

            // Check if ticket system is setup
            const config = getTicketConfig(guild.id);
            if (!config) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Ticket system belum diatur! Gunakan `/ticket setup` terlebih dahulu.')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Check if user already has an open ticket
            const userTickets = getUserTickets(interaction.user.id, guild.id);
            const openTicket = userTickets.find(t => t.is_closed === 0);
            
            if (openTicket) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Anda sudah memiliki ticket yang terbuka: <#${openTicket.channel_id}>`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            try {
                // Get or create ticket category
                let ticketCategory = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === 'tickets'
                );

                if (!ticketCategory) {
                    ticketCategory = await guild.channels.create({
                        name: 'Tickets',
                        type: ChannelType.GuildCategory,
                        permissionOverwrites: [
                            {
                                id: guild.id,
                                deny: ['ViewChannel'],
                            },
                        ],
                    });
                }

                // Create ticket channel
                const ticketId = `ticket-${interaction.user.id}-${Date.now()}`;
                const ticketChannel = await guild.channels.create({
                    name: ticketId,
                    type: ChannelType.GuildText,
                    parent: ticketCategory.id,
                    permissionOverwrites: [
                        {
                            id: guild.id,
                            deny: ['ViewChannel'],
                        },
                        {
                            id: interaction.user.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
                        },
                        {
                            id: client.user!.id,
                            allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels'],
                        },
                    ],
                });

                // Add role to channel if configured
                if (config.role_id) {
                    await ticketChannel.permissionOverwrites.edit(config.role_id, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                    });
                }

                // Create ticket in database
                createTicket(ticketId, guild.id, ticketChannel.id, interaction.user.id);

                // Send welcome message
                const welcomeEmbed = new EmbedBuilder()
                    .setTitle('🎫 Ticket Dibuka')
                    .setDescription(`Halo <@${interaction.user.id}>!\n\nTerima kasih telah membuat ticket. Silakan jelaskan masalah atau pertanyaan Anda.\n\n${config.role_id ? `<@&${config.role_id}> akan segera membantu Anda.` : 'Staff akan segera membantu Anda.'}\n\nGunakan \`/ticket close\` untuk menutup ticket ini.`)
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(`Ticket ID: ${ticketId}`),
                        iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                await ticketChannel.send({ 
                    content: config.role_id ? `<@&${config.role_id}>` : undefined,
                    embeds: [welcomeEmbed] 
                });

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ Ticket Berhasil Dibuat')
                    .setDescription(`Ticket Anda telah dibuat: ${ticketChannel}`)
                    .setColor(0x00FF00)
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });
            } catch (error: any) {
                console.error('[TICKET] Error creating ticket:', error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Gagal membuat ticket: ${error.message}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [errorEmbed] });
            }
            return;
        }

        // Close subcommand
        if (subcommand === 'close') {
            await interaction.deferReply();

            const channel = interaction.channel;
            if (!channel || !channel.isTextBased()) {
                return interaction.editReply({ content: '❌ Command ini hanya bisa digunakan di channel text!' });
            }

            // Get ticket from database
            const ticket = getTicketByChannel(channel.id);
            if (!ticket) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Channel ini bukan ticket!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Check if already closed
            if (ticket.is_closed === 1) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Ticket ini sudah ditutup!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Check permissions (creator or staff)
            const isCreator = ticket.creator_id === interaction.user.id;
            const isStaff = interaction.memberPermissions?.has('ManageChannels') || false;

            if (!isCreator && !isStaff) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Hanya creator ticket atau staff yang bisa menutup ticket!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            try {
                // Close ticket in database (mark as closed)
                closeTicket(ticket.id);

                // Send closing message
                const closeEmbed = new EmbedBuilder()
                    .setTitle('🔒 Ticket Ditutup')
                    .setDescription(`Ticket ditutup oleh <@${interaction.user.id}>\n\nTicket akan dihapus dalam 5 detik...`)
                    .setColor(0xFFA500)
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(),
                        iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                await interaction.editReply({ embeds: [closeEmbed] });

                // Delete channel and data after 5 seconds
                setTimeout(async () => {
                    try {
                        // Delete ticket from database
                        deleteTicket(ticket.id);
                        
                        // Delete channel
                        if (channel.isTextBased() && 'deletable' in channel && channel.deletable) {
                            await channel.delete();
                        }
                    } catch (error) {
                        console.error('[TICKET] Error deleting ticket channel:', error);
                    }
                }, 5000);
            } catch (error: any) {
                console.error('[TICKET] Error closing ticket:', error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Gagal menutup ticket: ${error.message}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [errorEmbed] });
            }
            return;
        }

        // Delete subcommand
        if (subcommand === 'delete') {
            await interaction.deferReply();

            // Check permissions
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Anda tidak memiliki permission untuk menggunakan command ini!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            const channel = interaction.channel;
            if (!channel || !channel.isTextBased()) {
                return interaction.editReply({ content: '❌ Command ini hanya bisa digunakan di channel text!' });
            }

            // Get ticket from database
            const ticket = getTicketByChannel(channel.id);
            if (!ticket) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Channel ini bukan ticket!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            try {
                // Delete ticket from database
                deleteTicket(ticket.id);

                // Delete channel
                if (channel.isTextBased() && 'deletable' in channel && channel.deletable) {
                    await channel.delete();
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle('✅ Ticket Dihapus')
                        .setDescription('Ticket telah dihapus dari database.')
                        .setColor(0x00FF00)
                        .setTimestamp();

                    await interaction.editReply({ embeds: [embed] });
                }
            } catch (error: any) {
                console.error('[TICKET] Error deleting ticket:', error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Gagal menghapus ticket: ${error.message}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [errorEmbed] });
            }
            return;
        }

        // Remove subcommand
        if (subcommand === 'remove') {
            await interaction.deferReply();

            // Check permissions
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Anda tidak memiliki permission untuk menggunakan command ini!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            const channel = interaction.channel;
            if (!channel || !channel.isTextBased()) {
                return interaction.editReply({ content: '❌ Command ini hanya bisa digunakan di channel text!' });
            }

            const user = interaction.options.getUser('user', true);

            // Get ticket from database
            const ticket = getTicketByChannel(channel.id);
            if (!ticket) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Channel ini bukan ticket!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Check if user is creator
            if (ticket.creator_id === user.id) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('Tidak bisa menghapus creator ticket!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Check if user is in ticket
            const members = getTicketMembers(ticket.id);
            if (!members.includes(user.id)) {
                const embed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('User tidak ada di ticket ini!')
                    .setColor(0xFF0000)
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            try {
                // Remove user from database
                removeTicketMember(ticket.id, user.id);

                // Remove user from channel
                if (channel.isTextBased() && 'permissionsFor' in channel && 'permissionOverwrites' in channel) {
                    if (channel.permissionsFor(user)?.has('ViewChannel')) {
                        await channel.permissionOverwrites.edit(user.id, {
                            ViewChannel: false,
                        });
                    }
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ User Dihapus')
                    .setDescription(`<@${user.id}> telah dihapus dari ticket ini.`)
                    .setColor(0x00FF00)
                    .setTimestamp()
                    .setFooter({
                        text: getFooterText(`Diminta oleh ${interaction.user.tag}`),
                        iconURL: interaction.user.displayAvatarURL({ forceStatic: false }) || undefined
                    });

                await interaction.editReply({ embeds: [successEmbed] });
            } catch (error: any) {
                console.error('[TICKET] Error removing user from ticket:', error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription(`Gagal menghapus user: ${error.message}`)
                    .setColor(0xFF0000)
                    .setTimestamp();

                await interaction.editReply({ embeds: [errorEmbed] });
            }
            return;
        }
    },
};
