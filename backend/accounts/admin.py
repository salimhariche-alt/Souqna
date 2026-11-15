from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import User


class SouqnaUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ('phone', 'email', 'display_name')


class SouqnaUserChangeForm(UserChangeForm):
    class Meta:
        model = User
        fields = '__all__'


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = SouqnaUserChangeForm
    add_form = SouqnaUserCreationForm

    list_display = ('phone', 'display_name', 'email', 'wilaya', 'preferred_language',
                    'is_staff', 'is_active', 'date_joined')
    list_filter = ('preferred_language', 'wilaya', 'is_staff', 'is_active')
    search_fields = ('phone', 'display_name', 'email')
    ordering = ('-date_joined',)

    fieldsets = (
        (None, {'fields': ('phone', 'password')}),
        ('Profile', {'fields': ('display_name', 'email', 'wilaya', 'preferred_language')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser',
                                    'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'description': 'Enter a phone number, an email, or both.',
            'fields': ('phone', 'email', 'display_name', 'password1', 'password2'),
        }),
    )
