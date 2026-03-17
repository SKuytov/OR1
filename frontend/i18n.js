// frontend/i18n.js - Internationalization System
// Bulgarian (default) and English language support

const translations = {
    bg: {
        // Login Screen
        'login.title': 'Вход в системата',
        'login.username': 'Потребителско име',
        'login.password': 'Парола',
        'login.button': 'Вход',
        'login.error': 'Грешка при влизане',
        
        // Navigation
        'nav.orders': 'Поръчки',
        'nav.quotes': 'Оферти',
        'nav.approvals': 'Одобрения',
        'nav.suppliers': 'Доставчици',
        'nav.documents': 'Документи',
        'nav.buildings': 'Сгради',
        'nav.costCenters': 'Разходни центрове',
        'nav.users': 'Потребители',
        'nav.logout': 'Изход',
        
        // User Roles
        'role.admin': 'Администратор',
        'role.procurement': 'Снабдяване',
        'role.manager': 'Мениджър',
        'role.requester': 'Заявител',
        
        // Order Creation
        'order.create.title': 'Създаване на поръчка',
        'order.create.building': 'Сграда',
        'order.create.costCenter': 'Разходен център',
        'order.create.costCenter.select': 'Изберете разходен център:',
        'order.create.costCenter.none': 'Няма дефинирани разходни центрове за тази сграда',
        'order.create.costCenter.selectBuilding': 'Изберете сграда първо',
        'order.create.itemDescription': 'Описание на артикула',
        'order.create.itemDescription.placeholder': 'Опишете детайлно нужния артикул...',
        'order.create.partNumber': 'Код на производителя/Каталожен номер',
        'order.create.partNumber.placeholder': 'Ако е приложимо',
        'order.create.category': 'Категория',
        'order.create.category.placeholder': 'напр. Лагер, Цилиндри, Електрически материали, Инструменти...',
        'order.create.quantity': 'Количество',
        'order.create.dateNeeded': 'Нужно до дата',
        'order.create.priority': 'Приоритет',
        'order.create.priority.normal': 'Нормален',
        'order.create.priority.urgent': 'Спешен',
        'order.create.priority.critical': 'Критичен',
        'order.create.notes': 'Бележки',
        'order.create.notes.placeholder': 'Допълнителна информация...',
        'order.create.attachments': 'Прикачени файлове',
        'order.create.attachments.help': 'Спецификации, снимки, чертежи и др.',
        'order.create.submit': 'Създай поръчка',
        'order.create.success': 'Поръчката е създадена успешно!',
        'order.create.error': 'Грешка при създаване на поръчка',
        'order.create.selectCostCenter': 'Моля изберете Разходен център',
        
        // Orders Table
        'orders.title': 'Поръчки',
        'orders.search': 'Търсене...',
        'orders.filter.status': 'Статус: Всички',
        'orders.filter.building': 'Сграда: Всички',
        'orders.filter.priority': 'Приоритет: Всички',
        'orders.filter.supplier': 'Доставчик: Всички',
        'orders.filter.delivery': 'Доставка: Всички',
        'orders.filter.clear': 'Изчисти филтрите',
        'orders.view.flat': 'Плосък изглед',
        'orders.view.grouped': 'Групиран изглед',
        'orders.quickFilter.new': 'Нови',
        'orders.quickFilter.ordered': 'Поръчани',
        'orders.quickFilter.transit': 'В транзит',
        'orders.quickFilter.late': 'Закъснели',
        'orders.quickFilter.due7': 'Пристигащи до 7 дни',
        'orders.quickFilter.due14': 'Пристигащи до 14 дни',
        'orders.noOrders': 'Няма намерени поръчки.',
        'orders.selected': 'избрани',
        'orders.actions.createQuote': 'Създай оферта',
        
        // Order Columns
        'orders.col.id': 'ID',
        'orders.col.item': 'Артикул',
        'orders.col.costCenter': 'Разходен център',
        'orders.col.qty': 'К-во',
        'orders.col.status': 'Статус',
        'orders.col.priority': 'Приоритет',
        'orders.col.files': 'Файлове',
        'orders.col.requester': 'Заявител',
        'orders.col.delivery': 'Доставка',
        'orders.col.needed': 'Нужно до',
        'orders.col.supplier': 'Доставчик',
        'orders.col.building': 'Сграда',
        'orders.col.unit': 'Ед. цена',
        'orders.col.total': 'Обща цена',
        'orders.col.view': 'Преглед',
        
        // Order Statuses
        'status.New': 'Нова',
        'status.Pending': 'Чакаща',
        'status.Quote Requested': 'Поискана оферта',
        'status.Quote Received': 'Получена оферта',
        'status.Quote Under Approval': 'Оферта в процес на одобрение',
        'status.Approved': 'Одобрена',
        'status.Ordered': 'Поръчана',
        'status.In Transit': 'В транзит',
        'status.Partially Delivered': 'Частично доставена',
        'status.Delivered': 'Доставена',
        'status.Cancelled': 'Анулирана',
        'status.On Hold': 'На изчакване',
        
        // Delivery Status
        'delivery.late': '⚠ Закъсняла',
        'delivery.due7': '🕒 До 7 дни',
        'delivery.due14': '📅 До 14 дни',
        'delivery.ontrack': '✓ В график',
        'delivery.none': '-',
        
        // Order Detail Panel
        'orderDetail.title': 'Детайли на поръчката',
        'orderDetail.orderId': 'Номер на поръчка',
        'orderDetail.building': 'Сграда',
        'orderDetail.costCenter': 'Разходен център',
        'orderDetail.status': 'Статус',
        'orderDetail.priority': 'Приоритет',
        'orderDetail.dateNeeded': 'Нужно до дата',
        'orderDetail.expectedDelivery': 'Очаквана доставка',
        'orderDetail.deliveryStatus': 'Статус на доставка',
        'orderDetail.requester': 'Заявител',
        'orderDetail.supplier': 'Доставчик',
        'orderDetail.unitPrice': 'Единична цена',
        'orderDetail.totalPrice': 'Обща цена',
        'orderDetail.itemDescription': 'Описание на артикула',
        'orderDetail.partNumber': 'Партиден номер',
        'orderDetail.category': 'Категория',
        'orderDetail.notes': 'Бележки',
        'orderDetail.attachments': 'Прикачени файлове',
        'orderDetail.noAttachments': 'Няма прикачени файлове.',
        'orderDetail.history': 'История',
        'orderDetail.suggestedSuppliers': '💡 Предложени доставчици',
        'orderDetail.suggestedSuppliers.desc': 'AI препоръки на база описание и история',
        'orderDetail.browseAll': '🏢 Разгледай всички',
        'orderDetail.update': 'Актуализирай поръчката',
        'orderDetail.selectSupplier': '🏢 Избери',
        'orderDetail.noSupplier': 'Няма избран доставчик',
        'orderDetail.save': 'Запази',
        'orderDetail.close': 'Затвори',
        'orderDetail.updated': 'Поръчката е актуализирана',
        'orderDetail.updateError': 'Грешка при актуализация на поръчка',
        
        // Quotes
        'quotes.title': 'Оферти',
        'quotes.noQuotes': 'Още няма оферти.',
        'quotes.refresh': 'Опресни',
        'quotes.col.number': 'Номер',
        'quotes.col.supplier': 'Доставчик',
        'quotes.col.status': 'Статус',
        'quotes.col.items': 'Артикули',
        'quotes.col.total': 'Обща сума',
        'quotes.col.validUntil': 'Валидна до',
        'quotes.col.created': 'Създадена',
        'quotes.col.view': 'Преглед',
        
        // Quote Detail
        'quoteDetail.title': 'Детайли на офертата',
        'quoteDetail.number': 'Номер на оферта',
        'quoteDetail.status': 'Статус',
        'quoteDetail.supplier': 'Доставчик',
        'quoteDetail.validUntil': 'Валидна до',
        'quoteDetail.totalAmount': 'Обща сума',
        'quoteDetail.currency': 'Валута',
        'quoteDetail.notes': 'Бележки',
        'quoteDetail.items': 'Артикули',
        'quoteDetail.approvalWorkflow': 'Работен процес за одобрение',
        'quoteDetail.approvalWorkflow.desc': 'Изпрати тази оферта към мениджър за одобрение',
        'quoteDetail.submitForApproval': '📋 Изпрати за одобрение',
        'quoteDetail.update': 'Актуализирай офертата',
        'quoteDetail.save': 'Запази',
        'quoteDetail.updated': 'Офертата е актуализирана',
        'quoteDetail.updateError': 'Грешка при актуализация на офертата',
        
        // Quote Statuses
        'quoteStatus.Draft': 'Чернова',
        'quoteStatus.Sent to Supplier': 'Изпратена до доставчик',
        'quoteStatus.Received': 'Получена',
        'quoteStatus.Under Approval': 'За одобрение',
        'quoteStatus.Approved': 'Одобрена',
        'quoteStatus.Rejected': 'Отхвърлена',
        
        // Suppliers
        'suppliers.title': 'Доставчици',
        'suppliers.noSuppliers': 'Още няма доставчици.',
        'suppliers.new': 'Нов доставчик',
        'suppliers.col.name': 'Име',
        'suppliers.col.contact': 'Контакт',
        'suppliers.col.email': 'Имейл',
        'suppliers.col.phone': 'Телефон',
        'suppliers.col.active': 'Активен',
        'suppliers.col.edit': 'Редактирай',
        
        // Supplier Form
        'supplierForm.create': 'Създаване на доставчик',
        'supplierForm.edit': 'Редактиране на доставчик',
        'supplierForm.name': 'Име на доставчик',
        'supplierForm.contact': 'Лице за контакт',
        'supplierForm.email': 'Имейл',
        'supplierForm.phone': 'Телефон',
        'supplierForm.website': 'Уебсайт',
        'supplierForm.address': 'Адрес',
        'supplierForm.notes': 'Бележки',
        'supplierForm.active': 'Активен',
        'supplierForm.yes': 'Да',
        'supplierForm.no': 'Не',
        'supplierForm.save': 'Запази',
        'supplierForm.cancel': 'Отказ',
        'supplierForm.saved': 'Доставчикът е запазен',
        'supplierForm.error': 'Грешка при запазване на доставчик',
        'supplierForm.nameRequired': 'Името е задължително',
        
        // Buildings
        'buildings.title': 'Сгради',
        'buildings.noBuildings': 'Още няма сгради.',
        'buildings.new': 'Нова сграда',
        'buildings.col.code': 'Код',
        'buildings.col.name': 'Име',
        'buildings.col.active': 'Активна',
        'buildings.col.edit': 'Редактирай',
        
        // Building Form
        'buildingForm.create': 'Създаване на сграда',
        'buildingForm.edit': 'Редактиране на сграда',
        'buildingForm.code': 'Код на сграда',
        'buildingForm.name': 'Име на сграда',
        'buildingForm.description': 'Описание',
        'buildingForm.active': 'Активна',
        'buildingForm.save': 'Запази',
        'buildingForm.cancel': 'Отказ',
        'buildingForm.saved': 'Сградата е запазена',
        'buildingForm.error': 'Грешка при запазване на сграда',
        'buildingForm.required': 'Кодът и името са задължителни',
        
        // Cost Centers
        'costCenters.title': 'Разходни центрове',
        'costCenters.noCostCenters': 'Няма намерени разходни центрове.',
        'costCenters.new': 'Нов разходен център',
        'costCenters.filter.building': 'Всички сгради',
        'costCenters.col.building': 'Сграда',
        'costCenters.col.code': 'Код',
        'costCenters.col.name': 'Име',
        'costCenters.col.active': 'Активен',
        'costCenters.col.edit': 'Редактирай',
        
        // Cost Center Form
        'costCenterForm.create': 'Създаване на разходен център',
        'costCenterForm.edit': 'Редактиране на разходен център',
        'costCenterForm.building': 'Сграда',
        'costCenterForm.building.select': 'Избери сграда',
        'costCenterForm.code': 'Код',
        'costCenterForm.name': 'Име',
        'costCenterForm.description': 'Описание',
        'costCenterForm.active': 'Активен',
        'costCenterForm.save': 'Запази',
        'costCenterForm.cancel': 'Отказ',
        'costCenterForm.delete': 'Изтрий',
        'costCenterForm.saved': 'Разходният център е запазен',
        'costCenterForm.error': 'Грешка при запазване на разходен център',
        'costCenterForm.required': 'Сградата, кодът и името са задължителни',
        'costCenterForm.deleteConfirm': 'Сигурни ли сте, че искате да изтриете този разходен център?',
        'costCenterForm.deleted': 'Разходният център е изтрит',
        'costCenterForm.deleteError': 'Грешка при изтриване',
        
        // Users
        'users.title': 'Потребители',
        'users.noUsers': 'Още няма потребители.',
        'users.new': 'Нов потребител',
        'users.col.username': 'Потребителско име',
        'users.col.name': 'Име',
        'users.col.email': 'Имейл',
        'users.col.role': 'Роля',
        'users.col.building': 'Сграда',
        'users.col.active': 'Активен',
        'users.col.edit': 'Редактирай',
        'users.col.resetPassword': 'Смени парола',
        
        // User Form
        'userForm.create': 'Създаване на потребител',
        'userForm.edit': 'Редактиране на потребител',
        'userForm.username': 'Потребителско име',
        'userForm.name': 'Пълно име',
        'userForm.email': 'Имейл',
        'userForm.role': 'Роля',
        'userForm.role.select': 'Избери роля',
        'userForm.building': 'Сграда',
        'userForm.building.none': 'Няма',
        'userForm.active': 'Активен',
        'userForm.password': 'Парола',
        'userForm.save': 'Запази',
        'userForm.cancel': 'Отказ',
        'userForm.saved': 'Потребителят е запазен',
        'userForm.created': 'Потребител създаден. Първоначална парола:',
        'userForm.error': 'Грешка при запазване на потребител',
        'userForm.required': 'Потребителското име, име, имейл и роля са задължителни',
        'userForm.resetPassword': 'Въведете нова парола (минимум 6 символа):',
        'userForm.resetPassword.confirm': 'Потвърдете новата парола:',
        'userForm.resetPassword.short': 'Паролата е твърде кратка. Нищо не е променено.',
        'userForm.resetPassword.mismatch': 'Паролите не съвпадат. Нищо не е променено.',
        'userForm.resetPassword.success': 'Паролата е сменена успешно.',
        'userForm.resetPassword.error': 'Грешка при смяна на парола',
        
        // Common
        'common.yes': 'Да',
        'common.no': 'Не',
        'common.save': 'Запази',
        'common.cancel': 'Отказ',
        'common.delete': 'Изтрий',
        'common.edit': 'Редактирай',
        'common.view': 'Преглед',
        'common.close': 'Затвори',
        'common.search': 'Търсене...',
        'common.all': 'Всички',
        'common.none': 'Няма',
        'common.select': 'Избери',
        'common.loading': 'Зареждане...',
        'common.error': 'Грешка',
        'common.success': 'Успешно',
        
        // Language
        'language.label': 'Език',
        'language.bg': '🇧🇬 Български',
        'language.en': '🇬🇧 English',

        // Analytics
        'nav.analytics': '\u{1F4CA} Анализи'
    },

    en: {
        // Login Screen
        'login.title': 'System Login',
        'login.username': 'Username',
        'login.password': 'Password',
        'login.button': 'Login',
        'login.error': 'Login error',
        
        // Navigation
        'nav.orders': 'Orders',
        'nav.quotes': 'Quotes',
        'nav.approvals': 'Approvals',
        'nav.suppliers': 'Suppliers',
        'nav.documents': 'Documents',
        'nav.buildings': 'Buildings',
        'nav.costCenters': 'Cost Centers',
        'nav.users': 'Users',
        'nav.logout': 'Logout',
        
        // User Roles
        'role.admin': 'Admin',
        'role.procurement': 'Procurement',
        'role.manager': 'Manager',
        'role.requester': 'Requester',
        
        // Order Creation
        'order.create.title': 'Create Order',
        'order.create.building': 'Building',
        'order.create.costCenter': 'Cost Center',
        'order.create.costCenter.select': 'Select cost center:',
        'order.create.costCenter.none': 'No cost centers defined for this building',
        'order.create.costCenter.selectBuilding': 'Select a building first',
        'order.create.itemDescription': 'Item Description',
        'order.create.itemDescription.placeholder': 'Describe the needed item in detail...',
        'order.create.partNumber': 'Part Number',
        'order.create.partNumber.placeholder': 'If applicable',
        'order.create.category': 'Category',
        'order.create.category.placeholder': 'e.g. Electrical, Tools...',
        'order.create.quantity': 'Quantity',
        'order.create.dateNeeded': 'Date Needed',
        'order.create.priority': 'Priority',
        'order.create.priority.normal': 'Normal',
        'order.create.priority.urgent': 'Urgent',
        'order.create.priority.critical': 'Critical',
        'order.create.notes': 'Notes',
        'order.create.notes.placeholder': 'Additional information...',
        'order.create.attachments': 'Attachments',
        'order.create.attachments.help': 'Specifications, photos, drawings, etc.',
        'order.create.submit': 'Create Order',
        'order.create.success': 'Order created successfully!',
        'order.create.error': 'Failed to create order',
        'order.create.selectCostCenter': 'Please select a Cost Center',
        
        // Orders Table
        'orders.title': 'Orders',
        'orders.search': 'Search...',
        'orders.filter.status': 'Status: All',
        'orders.filter.building': 'Building: All',
        'orders.filter.priority': 'Priority: All',
        'orders.filter.supplier': 'Supplier: All',
        'orders.filter.delivery': 'Delivery: All',
        'orders.filter.clear': 'Clear Filters',
        'orders.view.flat': 'Flat View',
        'orders.view.grouped': 'Grouped View',
        'orders.quickFilter.new': 'New',
        'orders.quickFilter.ordered': 'Ordered',
        'orders.quickFilter.transit': 'In Transit',
        'orders.quickFilter.late': 'Late',
        'orders.quickFilter.due7': 'Due in 7 days',
        'orders.quickFilter.due14': 'Due in 14 days',
        'orders.noOrders': 'No orders found.',
        'orders.selected': 'selected',
        'orders.actions.createQuote': 'Create Quote',
        
        // Order Columns
        'orders.col.id': 'ID',
        'orders.col.item': 'Item',
        'orders.col.costCenter': 'Cost Center',
        'orders.col.qty': 'Qty',
        'orders.col.status': 'Status',
        'orders.col.priority': 'Priority',
        'orders.col.files': 'Files',
        'orders.col.requester': 'Requester',
        'orders.col.delivery': 'Delivery',
        'orders.col.needed': 'Needed',
        'orders.col.supplier': 'Supplier',
        'orders.col.building': 'Building',
        'orders.col.unit': 'Unit Price',
        'orders.col.total': 'Total',
        'orders.col.view': 'View',
        
        // Order Statuses
        'status.New': 'New',
        'status.Pending': 'Pending',
        'status.Quote Requested': 'Quote Requested',
        'status.Quote Received': 'Quote Received',
        'status.Quote Under Approval': 'Quote Under Approval',
        'status.Approved': 'Approved',
        'status.Ordered': 'Ordered',
        'status.In Transit': 'In Transit',
        'status.Partially Delivered': 'Partially Delivered',
        'status.Delivered': 'Delivered',
        'status.Cancelled': 'Cancelled',
        'status.On Hold': 'On Hold',
        
        // Delivery Status
        'delivery.late': '⚠ Late',
        'delivery.due7': '🕒 Due 7d',
        'delivery.due14': '📅 Due 14d',
        'delivery.ontrack': '✓ On Track',
        'delivery.none': '-',
        
        // Order Detail Panel
        'orderDetail.title': 'Order Details',
        'orderDetail.orderId': 'Order ID',
        'orderDetail.building': 'Building',
        'orderDetail.costCenter': 'Cost Center',
        'orderDetail.status': 'Status',
        'orderDetail.priority': 'Priority',
        'orderDetail.dateNeeded': 'Date Needed',
        'orderDetail.expectedDelivery': 'Expected Delivery',
        'orderDetail.deliveryStatus': 'Delivery Status',
        'orderDetail.requester': 'Requester',
        'orderDetail.supplier': 'Supplier',
        'orderDetail.unitPrice': 'Unit Price',
        'orderDetail.totalPrice': 'Total Price',
        'orderDetail.itemDescription': 'Item Description',
        'orderDetail.partNumber': 'Part Number',
        'orderDetail.category': 'Category',
        'orderDetail.notes': 'Notes',
        'orderDetail.attachments': 'Attachments',
        'orderDetail.noAttachments': 'No attachments.',
        'orderDetail.history': 'History',
        'orderDetail.suggestedSuppliers': '💡 Suggested Suppliers',
        'orderDetail.suggestedSuppliers.desc': 'AI-powered recommendations based on description and history',
        'orderDetail.browseAll': '🏢 Browse All',
        'orderDetail.update': 'Update Order',
        'orderDetail.selectSupplier': '🏢 Select',
        'orderDetail.noSupplier': 'No supplier selected',
        'orderDetail.save': 'Save',
        'orderDetail.close': 'Close',
        'orderDetail.updated': 'Order updated',
        'orderDetail.updateError': 'Failed to update order',
        
        // Quotes
        'quotes.title': 'Quotes',
        'quotes.noQuotes': 'No quotes yet.',
        'quotes.refresh': 'Refresh',
        'quotes.col.number': 'Quote #',
        'quotes.col.supplier': 'Supplier',
        'quotes.col.status': 'Status',
        'quotes.col.items': 'Items',
        'quotes.col.total': 'Total',
        'quotes.col.validUntil': 'Valid Until',
        'quotes.col.created': 'Created',
        'quotes.col.view': 'View',
        
        // Quote Detail
        'quoteDetail.title': 'Quote Details',
        'quoteDetail.number': 'Quote #',
        'quoteDetail.status': 'Status',
        'quoteDetail.supplier': 'Supplier',
        'quoteDetail.validUntil': 'Valid Until',
        'quoteDetail.totalAmount': 'Total Amount',
        'quoteDetail.currency': 'Currency',
        'quoteDetail.notes': 'Notes',
        'quoteDetail.items': 'Items',
        'quoteDetail.approvalWorkflow': 'Approval Workflow',
        'quoteDetail.approvalWorkflow.desc': 'Submit this quote to a manager for approval',
        'quoteDetail.submitForApproval': '📋 Submit for Approval',
        'quoteDetail.update': 'Update Quote',
        'quoteDetail.save': 'Save',
        'quoteDetail.updated': 'Quote updated',
        'quoteDetail.updateError': 'Failed to update quote',
        
        // Quote Statuses
        'quoteStatus.Draft': 'Draft',
        'quoteStatus.Sent to Supplier': 'Sent to Supplier',
        'quoteStatus.Received': 'Received',
        'quoteStatus.Under Approval': 'Under Approval',
        'quoteStatus.Approved': 'Approved',
        'quoteStatus.Rejected': 'Rejected',
        
        // Suppliers
        'suppliers.title': 'Suppliers',
        'suppliers.noSuppliers': 'No suppliers yet.',
        'suppliers.new': 'New Supplier',
        'suppliers.col.name': 'Name',
        'suppliers.col.contact': 'Contact',
        'suppliers.col.email': 'Email',
        'suppliers.col.phone': 'Phone',
        'suppliers.col.active': 'Active',
        'suppliers.col.edit': 'Edit',
        
        // Supplier Form
        'supplierForm.create': 'Create Supplier',
        'supplierForm.edit': 'Edit Supplier',
        'supplierForm.name': 'Supplier Name',
        'supplierForm.contact': 'Contact Person',
        'supplierForm.email': 'Email',
        'supplierForm.phone': 'Phone',
        'supplierForm.website': 'Website',
        'supplierForm.address': 'Address',
        'supplierForm.notes': 'Notes',
        'supplierForm.active': 'Active',
        'supplierForm.yes': 'Yes',
        'supplierForm.no': 'No',
        'supplierForm.save': 'Save',
        'supplierForm.cancel': 'Cancel',
        'supplierForm.saved': 'Supplier saved',
        'supplierForm.error': 'Failed to save supplier',
        'supplierForm.nameRequired': 'Name is required',
        
        // Buildings
        'buildings.title': 'Buildings',
        'buildings.noBuildings': 'No buildings yet.',
        'buildings.new': 'New Building',
        'buildings.col.code': 'Code',
        'buildings.col.name': 'Name',
        'buildings.col.active': 'Active',
        'buildings.col.edit': 'Edit',
        
        // Building Form
        'buildingForm.create': 'Create Building',
        'buildingForm.edit': 'Edit Building',
        'buildingForm.code': 'Building Code',
        'buildingForm.name': 'Building Name',
        'buildingForm.description': 'Description',
        'buildingForm.active': 'Active',
        'buildingForm.save': 'Save',
        'buildingForm.cancel': 'Cancel',
        'buildingForm.saved': 'Building saved',
        'buildingForm.error': 'Failed to save building',
        'buildingForm.required': 'Code and name are required',
        
        // Cost Centers
        'costCenters.title': 'Cost Centers',
        'costCenters.noCostCenters': 'No cost centers found.',
        'costCenters.new': 'New Cost Center',
        'costCenters.filter.building': 'All Buildings',
        'costCenters.col.building': 'Building',
        'costCenters.col.code': 'Code',
        'costCenters.col.name': 'Name',
        'costCenters.col.active': 'Active',
        'costCenters.col.edit': 'Edit',
        
        // Cost Center Form
        'costCenterForm.create': 'Create Cost Center',
        'costCenterForm.edit': 'Edit Cost Center',
        'costCenterForm.building': 'Building',
        'costCenterForm.building.select': 'Select Building',
        'costCenterForm.code': 'Code',
        'costCenterForm.name': 'Name',
        'costCenterForm.description': 'Description',
        'costCenterForm.active': 'Active',
        'costCenterForm.save': 'Save',
        'costCenterForm.cancel': 'Cancel',
        'costCenterForm.delete': 'Delete',
        'costCenterForm.saved': 'Cost center saved',
        'costCenterForm.error': 'Failed to save cost center',
        'costCenterForm.required': 'Building, code and name are required',
        'costCenterForm.deleteConfirm': 'Are you sure you want to delete this cost center?',
        'costCenterForm.deleted': 'Cost center deleted',
        'costCenterForm.deleteError': 'Failed to delete',
        
        // Users
        'users.title': 'Users',
        'users.noUsers': 'No users yet.',
        'users.new': 'New User',
        'users.col.username': 'Username',
        'users.col.name': 'Name',
        'users.col.email': 'Email',
        'users.col.role': 'Role',
        'users.col.building': 'Building',
        'users.col.active': 'Active',
        'users.col.edit': 'Edit',
        'users.col.resetPassword': 'Reset Password',
        
        // User Form
        'userForm.create': 'Create User',
        'userForm.edit': 'Edit User',
        'userForm.username': 'Username',
        'userForm.name': 'Full Name',
        'userForm.email': 'Email',
        'userForm.role': 'Role',
        'userForm.role.select': 'Select Role',
        'userForm.building': 'Building',
        'userForm.building.none': 'None',
        'userForm.active': 'Active',
        'userForm.password': 'Password',
        'userForm.save': 'Save',
        'userForm.cancel': 'Cancel',
        'userForm.saved': 'User saved',
        'userForm.created': 'User created. Initial password:',
        'userForm.error': 'Failed to save user',
        'userForm.required': 'Username, name, email and role are required',
        'userForm.resetPassword': 'Enter new password (minimum 6 characters):',
        'userForm.resetPassword.confirm': 'Confirm new password:',
        'userForm.resetPassword.short': 'Password too short. Nothing changed.',
        'userForm.resetPassword.mismatch': 'Passwords do not match. Nothing changed.',
        'userForm.resetPassword.success': 'Password reset successfully.',
        'userForm.resetPassword.error': 'Failed to reset password',
        
        // Common
        'common.yes': 'Yes',
        'common.no': 'No',
        'common.save': 'Save',
        'common.cancel': 'Cancel',
        'common.delete': 'Delete',
        'common.edit': 'Edit',
        'common.view': 'View',
        'common.close': 'Close',
        'common.search': 'Search...',
        'common.all': 'All',
        'common.none': 'None',
        'common.select': 'Select',
        'common.loading': 'Loading...',
        'common.error': 'Error',
        'common.success': 'Success',
        
        // Language
        'language.label': 'Language',
        'language.bg': '🇧🇬 Български',
        'language.en': '🇬🇧 English',

        // Analytics
        'nav.analytics': '\u{1F4CA} Analytics'
    }
};

// Current language
let currentLanguage = localStorage.getItem('appLanguage') || 'bg';

// Translation function
function t(key) {
    return translations[currentLanguage][key] || key;
}

// Change language
function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLanguage = lang;
    localStorage.setItem('appLanguage', lang);
    translatePage();
}

// Translate all elements with data-i18n attribute
function translatePage() {
    // Translate static text elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const text = t(key);
        
        if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'password' || el.type === 'email')) {
            el.placeholder = text;
        } else if (el.tagName === 'TEXTAREA') {
            el.placeholder = text;
        } else {
            el.textContent = text;
        }
    });
    
    // Update language selector
    const langSelector = document.getElementById('languageSelector');
    if (langSelector) {
        langSelector.value = currentLanguage;
    }
    
    // Trigger re-rendering of dynamic content
    if (typeof window.triggerTranslationUpdate === 'function') {
        window.triggerTranslationUpdate();
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    translatePage();
});

// Export for use in other files
window.i18n = {
    t: t,
    setLanguage: setLanguage,
    translatePage: translatePage,
    getCurrentLanguage: () => currentLanguage
};
