module.exports = ({ ventas }, DataTypes) => {
    // Cubo de solo lectura (~2.2 M filas, 140 columnas): solo se declaran las que se consultan
    const VentaDiaria = ventas.define('VentaDiaria', {

        anio: {
            type: DataTypes.INTEGER,
            field: 'AÑO'
        },

        mes: {
            type: DataTypes.INTEGER,
            field: 'MES'
        },

        centro: {
            type: DataTypes.STRING,
            field: 'CENTRO'
        },

        fecha: {
            type: DataTypes.DATEONLY,
            field: 'FECHA'
        },

        valor_neto: {
            type: DataTypes.DECIMAL(18, 4),
            field: 'VALOR_NETO'
        }

    }, {
        tableName: 'CuboVentasDiario',
        schema: 'dbo',
        timestamps: false
    });

    VentaDiaria.removeAttribute('id');

    return VentaDiaria;
};
