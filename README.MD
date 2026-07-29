# Basico

```su - rpa``` (Se debe hacer con este usuario siempre)

```cd /var/projects/SIRHU-RPA``` (Directorio del proyecto)


# Comandos para manejar PM2 el servidor (Para gestionar los RPA)

# Ver procesos
```pm2 list```

# Reiniciar
```pm2 restart <rpa_name>```

# Detener
```pm2 stop <rpa_name>```

# Eliminar
```pm2 delete <rpa_name>```

# Monitoreo en tiempo real
```pm2 monit```

# Logs
```pm2 logs <rpa_name>```

# Agregar RPA
```pm2 start npm --name <rpa_name> -- run start:<rpa_name>``` (Se debe agregar a los scripts de package.json)

# Guardar configuración
```pm2 save```
