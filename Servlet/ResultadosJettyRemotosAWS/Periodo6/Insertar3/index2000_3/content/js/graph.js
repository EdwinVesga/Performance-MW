/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 371.0, "minX": 0.0, "maxY": 17174.0, "series": [{"data": [[0.0, 371.0], [0.1, 428.0], [0.2, 472.0], [0.3, 510.0], [0.4, 530.0], [0.5, 571.0], [0.6, 599.0], [0.7, 615.0], [0.8, 628.0], [0.9, 638.0], [1.0, 657.0], [1.1, 675.0], [1.2, 681.0], [1.3, 737.0], [1.4, 802.0], [1.5, 845.0], [1.6, 867.0], [1.7, 886.0], [1.8, 899.0], [1.9, 947.0], [2.0, 969.0], [2.1, 1051.0], [2.2, 1122.0], [2.3, 1187.0], [2.4, 1212.0], [2.5, 1250.0], [2.6, 1272.0], [2.7, 1290.0], [2.8, 1397.0], [2.9, 1438.0], [3.0, 1553.0], [3.1, 1710.0], [3.2, 1730.0], [3.3, 1849.0], [3.4, 1904.0], [3.5, 1964.0], [3.6, 1984.0], [3.7, 2078.0], [3.8, 2137.0], [3.9, 2179.0], [4.0, 2228.0], [4.1, 2359.0], [4.2, 2469.0], [4.3, 2540.0], [4.4, 2559.0], [4.5, 2591.0], [4.6, 2651.0], [4.7, 3072.0], [4.8, 3226.0], [4.9, 3258.0], [5.0, 3274.0], [5.1, 3298.0], [5.2, 3318.0], [5.3, 3375.0], [5.4, 3412.0], [5.5, 3430.0], [5.6, 3461.0], [5.7, 3481.0], [5.8, 3498.0], [5.9, 3550.0], [6.0, 3587.0], [6.1, 3665.0], [6.2, 3668.0], [6.3, 3677.0], [6.4, 3700.0], [6.5, 3725.0], [6.6, 3750.0], [6.7, 3774.0], [6.8, 3783.0], [6.9, 3792.0], [7.0, 3802.0], [7.1, 3811.0], [7.2, 3818.0], [7.3, 3822.0], [7.4, 3830.0], [7.5, 3842.0], [7.6, 3851.0], [7.7, 3862.0], [7.8, 3884.0], [7.9, 3889.0], [8.0, 3898.0], [8.1, 3903.0], [8.2, 3913.0], [8.3, 3923.0], [8.4, 3928.0], [8.5, 3934.0], [8.6, 3942.0], [8.7, 3965.0], [8.8, 3968.0], [8.9, 3975.0], [9.0, 3989.0], [9.1, 3998.0], [9.2, 4013.0], [9.3, 4020.0], [9.4, 4035.0], [9.5, 4046.0], [9.6, 4057.0], [9.7, 4064.0], [9.8, 4066.0], [9.9, 4076.0], [10.0, 4077.0], [10.1, 4096.0], [10.2, 4105.0], [10.3, 4116.0], [10.4, 4120.0], [10.5, 4134.0], [10.6, 4137.0], [10.7, 4149.0], [10.8, 4156.0], [10.9, 4175.0], [11.0, 4178.0], [11.1, 4196.0], [11.2, 4202.0], [11.3, 4208.0], [11.4, 4223.0], [11.5, 4228.0], [11.6, 4237.0], [11.7, 4247.0], [11.8, 4254.0], [11.9, 4265.0], [12.0, 4275.0], [12.1, 4298.0], [12.2, 4307.0], [12.3, 4343.0], [12.4, 4352.0], [12.5, 4356.0], [12.6, 4362.0], [12.7, 4387.0], [12.8, 4400.0], [12.9, 4415.0], [13.0, 4416.0], [13.1, 4434.0], [13.2, 4452.0], [13.3, 4469.0], [13.4, 4472.0], [13.5, 4476.0], [13.6, 4486.0], [13.7, 4508.0], [13.8, 4510.0], [13.9, 4512.0], [14.0, 4519.0], [14.1, 4522.0], [14.2, 4542.0], [14.3, 4552.0], [14.4, 4573.0], [14.5, 4578.0], [14.6, 4581.0], [14.7, 4588.0], [14.8, 4598.0], [14.9, 4599.0], [15.0, 4610.0], [15.1, 4622.0], [15.2, 4623.0], [15.3, 4633.0], [15.4, 4634.0], [15.5, 4648.0], [15.6, 4660.0], [15.7, 4672.0], [15.8, 4682.0], [15.9, 4686.0], [16.0, 4691.0], [16.1, 4694.0], [16.2, 4709.0], [16.3, 4716.0], [16.4, 4724.0], [16.5, 4745.0], [16.6, 4750.0], [16.7, 4756.0], [16.8, 4762.0], [16.9, 4764.0], [17.0, 4767.0], [17.1, 4773.0], [17.2, 4801.0], [17.3, 4813.0], [17.4, 4818.0], [17.5, 4838.0], [17.6, 4841.0], [17.7, 4846.0], [17.8, 4854.0], [17.9, 4863.0], [18.0, 4869.0], [18.1, 4875.0], [18.2, 4879.0], [18.3, 4880.0], [18.4, 4884.0], [18.5, 4893.0], [18.6, 4894.0], [18.7, 4903.0], [18.8, 4911.0], [18.9, 4915.0], [19.0, 4918.0], [19.1, 4945.0], [19.2, 4955.0], [19.3, 4963.0], [19.4, 4972.0], [19.5, 4984.0], [19.6, 4986.0], [19.7, 5005.0], [19.8, 5013.0], [19.9, 5016.0], [20.0, 5042.0], [20.1, 5044.0], [20.2, 5056.0], [20.3, 5061.0], [20.4, 5089.0], [20.5, 5101.0], [20.6, 5117.0], [20.7, 5129.0], [20.8, 5132.0], [20.9, 5142.0], [21.0, 5153.0], [21.1, 5172.0], [21.2, 5176.0], [21.3, 5180.0], [21.4, 5194.0], [21.5, 5197.0], [21.6, 5200.0], [21.7, 5212.0], [21.8, 5245.0], [21.9, 5267.0], [22.0, 5292.0], [22.1, 5294.0], [22.2, 5306.0], [22.3, 5312.0], [22.4, 5324.0], [22.5, 5336.0], [22.6, 5350.0], [22.7, 5367.0], [22.8, 5385.0], [22.9, 5417.0], [23.0, 5429.0], [23.1, 5454.0], [23.2, 5461.0], [23.3, 5469.0], [23.4, 5474.0], [23.5, 5476.0], [23.6, 5492.0], [23.7, 5495.0], [23.8, 5503.0], [23.9, 5506.0], [24.0, 5521.0], [24.1, 5527.0], [24.2, 5531.0], [24.3, 5532.0], [24.4, 5543.0], [24.5, 5561.0], [24.6, 5573.0], [24.7, 5576.0], [24.8, 5583.0], [24.9, 5591.0], [25.0, 5595.0], [25.1, 5601.0], [25.2, 5612.0], [25.3, 5628.0], [25.4, 5645.0], [25.5, 5655.0], [25.6, 5668.0], [25.7, 5674.0], [25.8, 5683.0], [25.9, 5692.0], [26.0, 5699.0], [26.1, 5710.0], [26.2, 5725.0], [26.3, 5733.0], [26.4, 5736.0], [26.5, 5738.0], [26.6, 5743.0], [26.7, 5751.0], [26.8, 5758.0], [26.9, 5765.0], [27.0, 5773.0], [27.1, 5813.0], [27.2, 5819.0], [27.3, 5835.0], [27.4, 5844.0], [27.5, 5851.0], [27.6, 5865.0], [27.7, 5873.0], [27.8, 5896.0], [27.9, 5901.0], [28.0, 5907.0], [28.1, 5915.0], [28.2, 5917.0], [28.3, 5924.0], [28.4, 5933.0], [28.5, 5935.0], [28.6, 5939.0], [28.7, 5948.0], [28.8, 5965.0], [28.9, 5999.0], [29.0, 6002.0], [29.1, 6019.0], [29.2, 6042.0], [29.3, 6043.0], [29.4, 6047.0], [29.5, 6062.0], [29.6, 6078.0], [29.7, 6091.0], [29.8, 6098.0], [29.9, 6105.0], [30.0, 6113.0], [30.1, 6124.0], [30.2, 6144.0], [30.3, 6159.0], [30.4, 6160.0], [30.5, 6163.0], [30.6, 6177.0], [30.7, 6202.0], [30.8, 6207.0], [30.9, 6229.0], [31.0, 6246.0], [31.1, 6250.0], [31.2, 6260.0], [31.3, 6277.0], [31.4, 6288.0], [31.5, 6291.0], [31.6, 6310.0], [31.7, 6322.0], [31.8, 6326.0], [31.9, 6350.0], [32.0, 6357.0], [32.1, 6365.0], [32.2, 6386.0], [32.3, 6397.0], [32.4, 6408.0], [32.5, 6430.0], [32.6, 6432.0], [32.7, 6447.0], [32.8, 6487.0], [32.9, 6507.0], [33.0, 6551.0], [33.1, 6558.0], [33.2, 6561.0], [33.3, 6567.0], [33.4, 6573.0], [33.5, 6580.0], [33.6, 6595.0], [33.7, 6610.0], [33.8, 6624.0], [33.9, 6640.0], [34.0, 6647.0], [34.1, 6676.0], [34.2, 6681.0], [34.3, 6717.0], [34.4, 6725.0], [34.5, 6737.0], [34.6, 6739.0], [34.7, 6755.0], [34.8, 6779.0], [34.9, 6786.0], [35.0, 6799.0], [35.1, 6809.0], [35.2, 6818.0], [35.3, 6823.0], [35.4, 6833.0], [35.5, 6846.0], [35.6, 6864.0], [35.7, 6869.0], [35.8, 6883.0], [35.9, 6899.0], [36.0, 6915.0], [36.1, 6924.0], [36.2, 6934.0], [36.3, 6945.0], [36.4, 6959.0], [36.5, 6965.0], [36.6, 6985.0], [36.7, 7012.0], [36.8, 7047.0], [36.9, 7073.0], [37.0, 7080.0], [37.1, 7113.0], [37.2, 7121.0], [37.3, 7141.0], [37.4, 7156.0], [37.5, 7170.0], [37.6, 7178.0], [37.7, 7224.0], [37.8, 7255.0], [37.9, 7261.0], [38.0, 7285.0], [38.1, 7303.0], [38.2, 7310.0], [38.3, 7316.0], [38.4, 7344.0], [38.5, 7390.0], [38.6, 7401.0], [38.7, 7422.0], [38.8, 7425.0], [38.9, 7453.0], [39.0, 7460.0], [39.1, 7480.0], [39.2, 7529.0], [39.3, 7552.0], [39.4, 7561.0], [39.5, 7569.0], [39.6, 7584.0], [39.7, 7630.0], [39.8, 7636.0], [39.9, 7655.0], [40.0, 7667.0], [40.1, 7682.0], [40.2, 7690.0], [40.3, 7696.0], [40.4, 7733.0], [40.5, 7754.0], [40.6, 7764.0], [40.7, 7776.0], [40.8, 7792.0], [40.9, 7808.0], [41.0, 7855.0], [41.1, 7874.0], [41.2, 7887.0], [41.3, 7909.0], [41.4, 7916.0], [41.5, 7920.0], [41.6, 7933.0], [41.7, 7938.0], [41.8, 7944.0], [41.9, 7953.0], [42.0, 7954.0], [42.1, 7971.0], [42.2, 7979.0], [42.3, 8001.0], [42.4, 8033.0], [42.5, 8047.0], [42.6, 8070.0], [42.7, 8074.0], [42.8, 8076.0], [42.9, 8083.0], [43.0, 8092.0], [43.1, 8099.0], [43.2, 8133.0], [43.3, 8136.0], [43.4, 8172.0], [43.5, 8188.0], [43.6, 8195.0], [43.7, 8198.0], [43.8, 8215.0], [43.9, 8225.0], [44.0, 8254.0], [44.1, 8267.0], [44.2, 8269.0], [44.3, 8280.0], [44.4, 8286.0], [44.5, 8293.0], [44.6, 8305.0], [44.7, 8318.0], [44.8, 8348.0], [44.9, 8355.0], [45.0, 8370.0], [45.1, 8373.0], [45.2, 8408.0], [45.3, 8419.0], [45.4, 8432.0], [45.5, 8438.0], [45.6, 8449.0], [45.7, 8454.0], [45.8, 8465.0], [45.9, 8504.0], [46.0, 8515.0], [46.1, 8555.0], [46.2, 8587.0], [46.3, 8599.0], [46.4, 8630.0], [46.5, 8636.0], [46.6, 8674.0], [46.7, 8694.0], [46.8, 8706.0], [46.9, 8733.0], [47.0, 8756.0], [47.1, 8784.0], [47.2, 8823.0], [47.3, 8833.0], [47.4, 8861.0], [47.5, 8870.0], [47.6, 8874.0], [47.7, 8889.0], [47.8, 8930.0], [47.9, 8941.0], [48.0, 8948.0], [48.1, 8949.0], [48.2, 8959.0], [48.3, 8966.0], [48.4, 8968.0], [48.5, 8993.0], [48.6, 9003.0], [48.7, 9007.0], [48.8, 9009.0], [48.9, 9018.0], [49.0, 9025.0], [49.1, 9053.0], [49.2, 9073.0], [49.3, 9083.0], [49.4, 9089.0], [49.5, 9102.0], [49.6, 9122.0], [49.7, 9142.0], [49.8, 9151.0], [49.9, 9174.0], [50.0, 9176.0], [50.1, 9191.0], [50.2, 9211.0], [50.3, 9228.0], [50.4, 9239.0], [50.5, 9289.0], [50.6, 9326.0], [50.7, 9349.0], [50.8, 9353.0], [50.9, 9368.0], [51.0, 9373.0], [51.1, 9392.0], [51.2, 9405.0], [51.3, 9427.0], [51.4, 9461.0], [51.5, 9471.0], [51.6, 9485.0], [51.7, 9494.0], [51.8, 9506.0], [51.9, 9517.0], [52.0, 9529.0], [52.1, 9541.0], [52.2, 9545.0], [52.3, 9562.0], [52.4, 9583.0], [52.5, 9592.0], [52.6, 9629.0], [52.7, 9640.0], [52.8, 9651.0], [52.9, 9679.0], [53.0, 9713.0], [53.1, 9724.0], [53.2, 9726.0], [53.3, 9749.0], [53.4, 9755.0], [53.5, 9769.0], [53.6, 9778.0], [53.7, 9788.0], [53.8, 9815.0], [53.9, 9821.0], [54.0, 9838.0], [54.1, 9858.0], [54.2, 9870.0], [54.3, 9877.0], [54.4, 9894.0], [54.5, 9902.0], [54.6, 9930.0], [54.7, 9954.0], [54.8, 9971.0], [54.9, 9987.0], [55.0, 10034.0], [55.1, 10052.0], [55.2, 10066.0], [55.3, 10094.0], [55.4, 10124.0], [55.5, 10128.0], [55.6, 10141.0], [55.7, 10173.0], [55.8, 10197.0], [55.9, 10205.0], [56.0, 10225.0], [56.1, 10228.0], [56.2, 10231.0], [56.3, 10242.0], [56.4, 10247.0], [56.5, 10252.0], [56.6, 10268.0], [56.7, 10272.0], [56.8, 10280.0], [56.9, 10299.0], [57.0, 10315.0], [57.1, 10323.0], [57.2, 10336.0], [57.3, 10346.0], [57.4, 10366.0], [57.5, 10374.0], [57.6, 10392.0], [57.7, 10408.0], [57.8, 10420.0], [57.9, 10435.0], [58.0, 10452.0], [58.1, 10464.0], [58.2, 10498.0], [58.3, 10511.0], [58.4, 10548.0], [58.5, 10562.0], [58.6, 10569.0], [58.7, 10585.0], [58.8, 10589.0], [58.9, 10593.0], [59.0, 10650.0], [59.1, 10662.0], [59.2, 10669.0], [59.3, 10693.0], [59.4, 10701.0], [59.5, 10708.0], [59.6, 10716.0], [59.7, 10737.0], [59.8, 10751.0], [59.9, 10754.0], [60.0, 10791.0], [60.1, 10803.0], [60.2, 10811.0], [60.3, 10819.0], [60.4, 10828.0], [60.5, 10837.0], [60.6, 10840.0], [60.7, 10846.0], [60.8, 10878.0], [60.9, 10893.0], [61.0, 10925.0], [61.1, 10933.0], [61.2, 10969.0], [61.3, 10977.0], [61.4, 10983.0], [61.5, 10999.0], [61.6, 11007.0], [61.7, 11017.0], [61.8, 11057.0], [61.9, 11063.0], [62.0, 11068.0], [62.1, 11074.0], [62.2, 11085.0], [62.3, 11098.0], [62.4, 11126.0], [62.5, 11147.0], [62.6, 11158.0], [62.7, 11174.0], [62.8, 11189.0], [62.9, 11199.0], [63.0, 11209.0], [63.1, 11223.0], [63.2, 11238.0], [63.3, 11249.0], [63.4, 11262.0], [63.5, 11268.0], [63.6, 11274.0], [63.7, 11309.0], [63.8, 11324.0], [63.9, 11324.0], [64.0, 11330.0], [64.1, 11351.0], [64.2, 11358.0], [64.3, 11369.0], [64.4, 11381.0], [64.5, 11389.0], [64.6, 11391.0], [64.7, 11401.0], [64.8, 11418.0], [64.9, 11430.0], [65.0, 11447.0], [65.1, 11474.0], [65.2, 11481.0], [65.3, 11492.0], [65.4, 11513.0], [65.5, 11514.0], [65.6, 11516.0], [65.7, 11538.0], [65.8, 11547.0], [65.9, 11553.0], [66.0, 11560.0], [66.1, 11584.0], [66.2, 11600.0], [66.3, 11617.0], [66.4, 11629.0], [66.5, 11635.0], [66.6, 11678.0], [66.7, 11680.0], [66.8, 11703.0], [66.9, 11722.0], [67.0, 11758.0], [67.1, 11773.0], [67.2, 11803.0], [67.3, 11835.0], [67.4, 11860.0], [67.5, 11870.0], [67.6, 11876.0], [67.7, 11891.0], [67.8, 11892.0], [67.9, 11922.0], [68.0, 11934.0], [68.1, 11940.0], [68.2, 11953.0], [68.3, 11958.0], [68.4, 11959.0], [68.5, 11966.0], [68.6, 11984.0], [68.7, 11994.0], [68.8, 11996.0], [68.9, 12007.0], [69.0, 12037.0], [69.1, 12060.0], [69.2, 12079.0], [69.3, 12105.0], [69.4, 12112.0], [69.5, 12117.0], [69.6, 12134.0], [69.7, 12170.0], [69.8, 12190.0], [69.9, 12200.0], [70.0, 12207.0], [70.1, 12238.0], [70.2, 12242.0], [70.3, 12255.0], [70.4, 12267.0], [70.5, 12282.0], [70.6, 12296.0], [70.7, 12326.0], [70.8, 12329.0], [70.9, 12343.0], [71.0, 12353.0], [71.1, 12366.0], [71.2, 12379.0], [71.3, 12384.0], [71.4, 12430.0], [71.5, 12437.0], [71.6, 12443.0], [71.7, 12469.0], [71.8, 12479.0], [71.9, 12493.0], [72.0, 12495.0], [72.1, 12497.0], [72.2, 12512.0], [72.3, 12518.0], [72.4, 12528.0], [72.5, 12539.0], [72.6, 12541.0], [72.7, 12547.0], [72.8, 12559.0], [72.9, 12564.0], [73.0, 12574.0], [73.1, 12597.0], [73.2, 12617.0], [73.3, 12620.0], [73.4, 12631.0], [73.5, 12639.0], [73.6, 12643.0], [73.7, 12657.0], [73.8, 12678.0], [73.9, 12683.0], [74.0, 12701.0], [74.1, 12704.0], [74.2, 12730.0], [74.3, 12741.0], [74.4, 12742.0], [74.5, 12754.0], [74.6, 12768.0], [74.7, 12788.0], [74.8, 12811.0], [74.9, 12852.0], [75.0, 12862.0], [75.1, 12877.0], [75.2, 12895.0], [75.3, 12904.0], [75.4, 12932.0], [75.5, 12945.0], [75.6, 12959.0], [75.7, 12966.0], [75.8, 12969.0], [75.9, 12974.0], [76.0, 12995.0], [76.1, 13005.0], [76.2, 13009.0], [76.3, 13031.0], [76.4, 13038.0], [76.5, 13046.0], [76.6, 13050.0], [76.7, 13068.0], [76.8, 13073.0], [76.9, 13087.0], [77.0, 13103.0], [77.1, 13109.0], [77.2, 13125.0], [77.3, 13128.0], [77.4, 13150.0], [77.5, 13183.0], [77.6, 13195.0], [77.7, 13208.0], [77.8, 13225.0], [77.9, 13244.0], [78.0, 13279.0], [78.1, 13298.0], [78.2, 13322.0], [78.3, 13362.0], [78.4, 13364.0], [78.5, 13384.0], [78.6, 13414.0], [78.7, 13441.0], [78.8, 13449.0], [78.9, 13463.0], [79.0, 13468.0], [79.1, 13478.0], [79.2, 13482.0], [79.3, 13499.0], [79.4, 13505.0], [79.5, 13521.0], [79.6, 13530.0], [79.7, 13554.0], [79.8, 13564.0], [79.9, 13579.0], [80.0, 13601.0], [80.1, 13603.0], [80.2, 13606.0], [80.3, 13613.0], [80.4, 13622.0], [80.5, 13631.0], [80.6, 13640.0], [80.7, 13659.0], [80.8, 13697.0], [80.9, 13711.0], [81.0, 13720.0], [81.1, 13748.0], [81.2, 13756.0], [81.3, 13762.0], [81.4, 13781.0], [81.5, 13807.0], [81.6, 13819.0], [81.7, 13835.0], [81.8, 13846.0], [81.9, 13854.0], [82.0, 13858.0], [82.1, 13865.0], [82.2, 13869.0], [82.3, 13883.0], [82.4, 13885.0], [82.5, 13904.0], [82.6, 13929.0], [82.7, 13930.0], [82.8, 13934.0], [82.9, 13940.0], [83.0, 13963.0], [83.1, 13975.0], [83.2, 13987.0], [83.3, 13989.0], [83.4, 13994.0], [83.5, 13997.0], [83.6, 14007.0], [83.7, 14018.0], [83.8, 14032.0], [83.9, 14034.0], [84.0, 14052.0], [84.1, 14063.0], [84.2, 14068.0], [84.3, 14072.0], [84.4, 14075.0], [84.5, 14077.0], [84.6, 14086.0], [84.7, 14094.0], [84.8, 14101.0], [84.9, 14106.0], [85.0, 14114.0], [85.1, 14128.0], [85.2, 14141.0], [85.3, 14149.0], [85.4, 14162.0], [85.5, 14184.0], [85.6, 14195.0], [85.7, 14220.0], [85.8, 14228.0], [85.9, 14246.0], [86.0, 14260.0], [86.1, 14270.0], [86.2, 14281.0], [86.3, 14294.0], [86.4, 14306.0], [86.5, 14313.0], [86.6, 14333.0], [86.7, 14342.0], [86.8, 14343.0], [86.9, 14360.0], [87.0, 14366.0], [87.1, 14388.0], [87.2, 14400.0], [87.3, 14413.0], [87.4, 14423.0], [87.5, 14431.0], [87.6, 14432.0], [87.7, 14435.0], [87.8, 14437.0], [87.9, 14438.0], [88.0, 14458.0], [88.1, 14466.0], [88.2, 14471.0], [88.3, 14492.0], [88.4, 14497.0], [88.5, 14507.0], [88.6, 14533.0], [88.7, 14546.0], [88.8, 14555.0], [88.9, 14559.0], [89.0, 14576.0], [89.1, 14587.0], [89.2, 14589.0], [89.3, 14594.0], [89.4, 14597.0], [89.5, 14603.0], [89.6, 14614.0], [89.7, 14636.0], [89.8, 14654.0], [89.9, 14668.0], [90.0, 14677.0], [90.1, 14681.0], [90.2, 14696.0], [90.3, 14697.0], [90.4, 14712.0], [90.5, 14721.0], [90.6, 14739.0], [90.7, 14777.0], [90.8, 14790.0], [90.9, 14804.0], [91.0, 14822.0], [91.1, 14840.0], [91.2, 14860.0], [91.3, 14869.0], [91.4, 14875.0], [91.5, 14876.0], [91.6, 14883.0], [91.7, 14913.0], [91.8, 14937.0], [91.9, 14949.0], [92.0, 14955.0], [92.1, 14966.0], [92.2, 14968.0], [92.3, 14970.0], [92.4, 14997.0], [92.5, 15009.0], [92.6, 15015.0], [92.7, 15018.0], [92.8, 15042.0], [92.9, 15048.0], [93.0, 15059.0], [93.1, 15068.0], [93.2, 15073.0], [93.3, 15088.0], [93.4, 15124.0], [93.5, 15125.0], [93.6, 15145.0], [93.7, 15149.0], [93.8, 15153.0], [93.9, 15159.0], [94.0, 15180.0], [94.1, 15217.0], [94.2, 15245.0], [94.3, 15249.0], [94.4, 15256.0], [94.5, 15265.0], [94.6, 15267.0], [94.7, 15292.0], [94.8, 15304.0], [94.9, 15305.0], [95.0, 15314.0], [95.1, 15328.0], [95.2, 15338.0], [95.3, 15362.0], [95.4, 15368.0], [95.5, 15377.0], [95.6, 15389.0], [95.7, 15407.0], [95.8, 15425.0], [95.9, 15432.0], [96.0, 15439.0], [96.1, 15458.0], [96.2, 15483.0], [96.3, 15507.0], [96.4, 15509.0], [96.5, 15534.0], [96.6, 15546.0], [96.7, 15625.0], [96.8, 15638.0], [96.9, 15645.0], [97.0, 15648.0], [97.1, 15664.0], [97.2, 15688.0], [97.3, 15718.0], [97.4, 15726.0], [97.5, 15769.0], [97.6, 15769.0], [97.7, 15807.0], [97.8, 15837.0], [97.9, 15847.0], [98.0, 15858.0], [98.1, 15878.0], [98.2, 15958.0], [98.3, 15972.0], [98.4, 15996.0], [98.5, 16023.0], [98.6, 16053.0], [98.7, 16187.0], [98.8, 16213.0], [98.9, 16478.0], [99.0, 16522.0], [99.1, 16681.0], [99.2, 16709.0], [99.3, 16790.0], [99.4, 16815.0], [99.5, 16933.0], [99.6, 16985.0], [99.7, 17035.0], [99.8, 17102.0], [99.9, 17146.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 300.0, "maxY": 30.0, "series": [{"data": [[300.0, 2.0], [400.0, 4.0], [500.0, 7.0], [600.0, 11.0], [700.0, 2.0], [800.0, 10.0], [900.0, 5.0], [1000.0, 2.0], [1100.0, 5.0], [1200.0, 7.0], [1300.0, 2.0], [1400.0, 3.0], [1500.0, 2.0], [1700.0, 3.0], [1800.0, 3.0], [1900.0, 5.0], [2000.0, 2.0], [2100.0, 4.0], [2200.0, 3.0], [2300.0, 1.0], [2400.0, 2.0], [2500.0, 6.0], [2600.0, 2.0], [2900.0, 1.0], [3000.0, 1.0], [3100.0, 1.0], [3200.0, 7.0], [3300.0, 5.0], [3400.0, 9.0], [3500.0, 4.0], [3700.0, 12.0], [3600.0, 7.0], [3800.0, 21.0], [3900.0, 22.0], [4000.0, 19.0], [4100.0, 20.0], [4200.0, 20.0], [4300.0, 13.0], [4400.0, 17.0], [4500.0, 26.0], [4600.0, 25.0], [4700.0, 20.0], [4800.0, 30.0], [4900.0, 20.0], [5000.0, 16.0], [5100.0, 22.0], [5300.0, 14.0], [5200.0, 11.0], [5400.0, 18.0], [5500.0, 27.0], [5600.0, 19.0], [5800.0, 16.0], [5700.0, 21.0], [5900.0, 21.0], [6100.0, 17.0], [6000.0, 18.0], [6200.0, 17.0], [6300.0, 17.0], [6400.0, 10.0], [6600.0, 12.0], [6500.0, 15.0], [6800.0, 18.0], [6700.0, 16.0], [6900.0, 14.0], [7100.0, 12.0], [7000.0, 8.0], [7400.0, 11.0], [7300.0, 10.0], [7200.0, 10.0], [7500.0, 11.0], [7600.0, 13.0], [7800.0, 8.0], [7900.0, 21.0], [7700.0, 10.0], [8100.0, 12.0], [8000.0, 17.0], [8300.0, 13.0], [8200.0, 16.0], [8400.0, 14.0], [8500.0, 9.0], [8600.0, 8.0], [8700.0, 9.0], [8900.0, 16.0], [8800.0, 11.0], [9000.0, 19.0], [9100.0, 13.0], [9200.0, 8.0], [9400.0, 11.0], [9300.0, 13.0], [9500.0, 16.0], [9700.0, 16.0], [9600.0, 8.0], [9800.0, 15.0], [10000.0, 9.0], [10100.0, 10.0], [10200.0, 21.0], [9900.0, 9.0], [10300.0, 15.0], [10400.0, 11.0], [10600.0, 8.0], [10500.0, 15.0], [10700.0, 13.0], [10800.0, 18.0], [10900.0, 12.0], [11000.0, 16.0], [11100.0, 12.0], [11200.0, 14.0], [11300.0, 21.0], [11400.0, 14.0], [11700.0, 8.0], [11600.0, 12.0], [11500.0, 16.0], [11800.0, 13.0], [11900.0, 21.0], [12100.0, 12.0], [12200.0, 15.0], [12000.0, 8.0], [12300.0, 14.0], [12400.0, 16.0], [12600.0, 16.0], [12700.0, 16.0], [12500.0, 20.0], [12800.0, 11.0], [13000.0, 18.0], [12900.0, 16.0], [13300.0, 8.0], [13200.0, 9.0], [13100.0, 14.0], [13600.0, 18.0], [13700.0, 12.0], [13500.0, 13.0], [13400.0, 16.0], [13800.0, 20.0], [13900.0, 21.0], [14000.0, 25.0], [14200.0, 15.0], [14300.0, 16.0], [14100.0, 17.0], [14500.0, 19.0], [14400.0, 26.0], [14600.0, 18.0], [14800.0, 16.0], [14700.0, 11.0], [15300.0, 17.0], [15000.0, 18.0], [14900.0, 15.0], [15100.0, 15.0], [15200.0, 14.0], [15400.0, 12.0], [15700.0, 9.0], [15600.0, 11.0], [15500.0, 9.0], [15800.0, 10.0], [15900.0, 5.0], [16000.0, 4.0], [16100.0, 3.0], [16200.0, 2.0], [16500.0, 2.0], [16400.0, 2.0], [16700.0, 4.0], [16600.0, 2.0], [16800.0, 2.0], [16900.0, 3.0], [17000.0, 3.0], [17100.0, 4.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 17100.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 6.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 1940.0, "series": [{"data": [[1.0, 54.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 6.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 1940.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 859.5420000000018, "minX": 1.5495834E12, "maxY": 859.5420000000018, "series": [{"data": [[1.5495834E12, 859.5420000000018]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 3640.2, "minX": 2.0, "maxY": 17174.0, "series": [{"data": [[2.0, 14416.0], [4.0, 15808.5], [5.0, 14869.0], [6.0, 15458.0], [7.0, 14653.0], [8.0, 15266.0], [10.0, 15197.0], [11.0, 15113.0], [12.0, 15648.0], [13.0, 17129.0], [14.0, 14435.0], [16.0, 15435.0], [17.0, 14603.0], [18.0, 14636.0], [19.0, 15528.0], [20.0, 15645.0], [21.0, 14696.0], [22.0, 14432.0], [23.0, 17174.0], [24.0, 15645.0], [25.0, 14792.0], [26.0, 14075.0], [27.0, 17035.0], [28.0, 14913.0], [29.0, 14721.0], [30.0, 14195.0], [31.0, 14594.0], [32.0, 17032.0], [35.0, 16194.0], [34.0, 15260.0], [37.0, 14220.0], [36.0, 15837.0], [39.0, 14510.5], [41.0, 14165.0], [40.0, 14789.0], [43.0, 14931.0], [42.0, 15046.0], [45.0, 17102.0], [44.0, 15688.0], [46.0, 16985.0], [49.0, 14052.0], [48.0, 14643.0], [51.0, 15972.0], [50.0, 14668.0], [53.0, 15628.0], [52.0, 14106.0], [55.0, 15368.0], [54.0, 14955.0], [57.0, 15153.0], [56.0, 15504.0], [59.0, 14559.0], [58.0, 14874.0], [61.0, 15769.0], [60.0, 15546.0], [63.0, 14098.0], [62.0, 14342.0], [67.0, 15039.0], [65.0, 14696.0], [64.0, 14949.0], [71.0, 14678.0], [70.0, 14296.0], [69.0, 14420.0], [68.0, 14471.0], [75.0, 15664.0], [74.0, 15863.0], [73.0, 15151.0], [72.0, 14071.0], [78.0, 5060.333333333333], [79.0, 14362.0], [77.0, 15815.0], [76.0, 15304.0], [83.0, 15465.0], [82.0, 14114.0], [81.0, 15769.0], [80.0, 17061.0], [87.0, 15432.0], [86.0, 15225.0], [85.0, 14485.5], [91.0, 15968.0], [90.0, 15878.0], [89.0, 14701.0], [88.0, 14716.0], [95.0, 15018.0], [94.0, 15847.0], [93.0, 14546.0], [92.0, 13930.0], [99.0, 14970.0], [98.0, 15362.0], [97.0, 15338.0], [96.0, 16023.0], [103.0, 15384.0], [102.0, 13940.0], [101.0, 15146.0], [100.0, 14213.0], [104.0, 7981.5], [107.0, 15042.0], [106.0, 14718.5], [111.0, 14688.0], [110.0, 15769.0], [109.0, 15638.0], [108.0, 16004.0], [114.0, 7188.5], [113.0, 7283.0], [112.0, 7189.5], [115.0, 15194.0], [118.0, 7489.5], [119.0, 15508.0], [117.0, 14876.0], [116.0, 15807.0], [120.0, 8145.0], [123.0, 15157.0], [122.0, 14992.0], [121.0, 16947.0], [126.0, 5088.666666666667], [125.0, 7950.5], [124.0, 15068.0], [135.0, 16880.0], [134.0, 14632.0], [133.0, 14587.0], [132.0, 13807.0], [131.0, 13846.0], [130.0, 15407.0], [129.0, 16933.0], [128.0, 14154.5], [136.0, 4438.5], [143.0, 15267.0], [142.0, 14407.0], [141.0, 15217.0], [140.0, 15592.0], [139.0, 14013.0], [138.0, 14997.0], [137.0, 14007.0], [144.0, 7976.5], [146.0, 8282.5], [147.0, 8026.5], [149.0, 8261.5], [151.0, 5336.0], [150.0, 14864.0], [148.0, 15534.0], [145.0, 14141.0], [152.0, 7339.0], [154.0, 5704.333333333333], [155.0, 7278.0], [159.0, 15001.0], [158.0, 15292.0], [157.0, 14458.0], [156.0, 16795.0], [153.0, 13963.0], [165.0, 7528.5], [167.0, 14413.0], [166.0, 14589.0], [164.0, 15073.0], [163.0, 15124.0], [162.0, 15680.0], [160.0, 15625.0], [175.0, 15125.0], [174.0, 14822.0], [173.0, 15305.0], [172.0, 15718.0], [171.0, 15542.0], [170.0, 14528.0], [169.0, 15671.0], [168.0, 15726.0], [183.0, 14253.0], [182.0, 15966.0], [180.0, 15483.0], [179.0, 13748.0], [178.0, 13935.0], [177.0, 13924.0], [176.0, 14347.0], [191.0, 16790.0], [190.0, 13904.0], [189.0, 14840.0], [188.0, 13994.0], [187.0, 14877.0], [186.0, 14062.0], [185.0, 14742.0], [184.0, 16815.0], [195.0, 8773.5], [199.0, 14885.0], [198.0, 14969.0], [197.0, 13699.0], [196.0, 14492.0], [194.0, 13613.0], [193.0, 15338.0], [192.0, 13963.0], [200.0, 7953.5], [203.0, 3640.2], [207.0, 15703.0], [206.0, 15327.0], [205.0, 15419.0], [204.0, 13711.0], [202.0, 16740.0], [201.0, 15652.0], [210.0, 5574.0], [209.0, 8828.0], [215.0, 15054.0], [214.0, 14436.0], [213.0, 13878.0], [212.0, 15258.0], [211.0, 14507.0], [208.0, 15439.0], [223.0, 15648.0], [222.0, 15107.5], [220.0, 14551.0], [219.0, 15308.0], [218.0, 13989.0], [217.0, 13823.0], [216.0, 15400.0], [230.0, 8056.0], [231.0, 14452.0], [229.0, 14791.5], [227.0, 16478.0], [226.0, 14811.0], [225.0, 14498.0], [224.0, 14228.0], [239.0, 14589.0], [238.0, 14603.0], [237.0, 14582.0], [236.0, 14342.0], [235.0, 14726.0], [234.0, 14712.0], [233.0, 13521.0], [232.0, 15314.0], [242.0, 7377.0], [246.0, 8747.5], [247.0, 13625.0], [245.0, 15245.0], [244.0, 13449.0], [243.0, 16522.0], [241.0, 16479.0], [240.0, 13640.0], [254.0, 5434.0], [255.0, 15048.0], [253.0, 14188.0], [252.0, 14883.0], [251.0, 13850.0], [250.0, 14002.0], [249.0, 14360.0], [248.0, 14343.0], [270.0, 15389.0], [257.0, 7469.0], [256.0, 15019.0], [259.0, 15355.0], [258.0, 14319.0], [271.0, 14018.0], [269.0, 14162.0], [268.0, 13741.5], [266.0, 14600.0], [265.0, 14227.0], [264.0, 13502.0], [263.0, 16299.0], [262.0, 13441.0], [261.0, 13606.0], [260.0, 13893.0], [286.0, 14122.0], [281.0, 7622.0], [285.0, 14875.0], [284.0, 13499.0], [283.0, 15125.0], [282.0, 14962.0], [280.0, 14228.0], [279.0, 14132.5], [273.0, 14860.0], [272.0, 15377.0], [275.0, 14876.0], [274.0, 14063.0], [277.0, 13228.0], [276.0, 16213.0], [301.0, 7943.0], [289.0, 7899.5], [291.0, 5792.333333333333], [290.0, 13606.0], [294.0, 5447.333333333333], [293.0, 15180.0], [292.0, 13934.0], [295.0, 8574.5], [288.0, 14325.0], [303.0, 15249.0], [302.0, 14463.0], [300.0, 14184.0], [299.0, 13094.0], [298.0, 13653.0], [297.0, 13929.0], [296.0, 13524.0], [317.0, 8151.0], [319.0, 8271.0], [314.0, 7810.0], [318.0, 13130.0], [316.0, 14774.0], [307.0, 14968.0], [306.0, 14294.0], [305.0, 13121.0], [304.0, 15159.0], [313.0, 16053.0], [312.0, 14270.0], [311.0, 13987.0], [310.0, 14533.0], [309.0, 13992.0], [308.0, 13128.0], [334.0, 13200.5], [324.0, 8597.0], [326.0, 14597.0], [325.0, 14466.0], [335.0, 14075.0], [332.0, 14077.0], [323.0, 14091.0], [322.0, 14084.0], [321.0, 13364.0], [320.0, 13457.0], [331.0, 15958.0], [330.0, 13031.0], [329.0, 14674.0], [328.0, 14966.0], [327.0, 16037.0], [351.0, 7374.0], [346.0, 7574.0], [348.0, 7931.0], [339.0, 14423.0], [338.0, 14966.0], [337.0, 14589.0], [336.0, 13931.0], [350.0, 12945.0], [349.0, 13613.0], [347.0, 14595.0], [345.0, 13520.0], [344.0, 14101.0], [343.0, 14437.0], [342.0, 13046.0], [341.0, 14804.0], [340.0, 14659.0], [367.0, 12657.0], [353.0, 7773.5], [358.0, 14107.0], [352.0, 13773.0], [357.0, 14072.0], [356.0, 14399.0], [362.0, 7241.0], [366.0, 13194.0], [365.0, 13720.0], [364.0, 13197.0], [355.0, 13837.5], [363.0, 13068.0], [361.0, 13414.0], [360.0, 14170.0], [383.0, 14313.0], [379.0, 7288.0], [382.0, 12800.0], [381.0, 13208.0], [380.0, 12956.0], [370.0, 13468.0], [369.0, 15755.0], [368.0, 13756.0], [378.0, 12945.0], [377.0, 12853.0], [376.0, 14576.0], [375.0, 13336.0], [374.0, 13319.0], [373.0, 14033.0], [372.0, 13983.0], [398.0, 12678.0], [396.0, 7989.0], [399.0, 14086.0], [397.0, 12493.0], [395.0, 12574.0], [394.0, 14145.0], [393.0, 12730.0], [392.0, 12995.0], [391.0, 12811.0], [385.0, 13930.0], [384.0, 13601.0], [387.0, 13125.0], [386.0, 14432.0], [390.0, 12511.0], [389.0, 14366.0], [388.0, 14129.0], [414.0, 15295.0], [415.0, 12539.0], [413.0, 14311.5], [403.0, 14023.0], [402.0, 12550.0], [401.0, 13050.0], [400.0, 12629.0], [411.0, 13602.0], [410.0, 15452.0], [409.0, 13868.0], [408.0, 14149.0], [407.0, 12470.0], [406.0, 12486.0], [405.0, 13298.0], [404.0, 14281.0], [431.0, 13478.0], [421.0, 7115.5], [420.0, 15256.0], [422.0, 12812.0], [426.0, 7002.5], [430.0, 12991.0], [429.0, 12969.0], [428.0, 12126.0], [419.0, 13005.0], [418.0, 13554.0], [417.0, 13745.0], [416.0, 13150.0], [423.0, 12741.0], [427.0, 13615.0], [425.0, 13884.0], [424.0, 12522.0], [446.0, 13463.0], [447.0, 13478.0], [445.0, 13579.0], [444.0, 12296.0], [443.0, 13499.0], [442.0, 15145.0], [441.0, 14074.0], [440.0, 12329.0], [439.0, 12114.0], [433.0, 13447.0], [432.0, 12620.0], [435.0, 13481.0], [434.0, 12995.0], [438.0, 13975.0], [437.0, 13073.0], [436.0, 15068.0], [462.0, 12479.0], [448.0, 7166.5], [453.0, 7154.5], [452.0, 12768.0], [455.0, 12872.0], [454.0, 11942.0], [463.0, 12207.0], [461.0, 12662.5], [451.0, 13633.0], [450.0, 12175.0], [449.0, 12061.0], [459.0, 13865.0], [458.0, 12862.0], [457.0, 12970.0], [456.0, 13811.0], [478.0, 12267.0], [479.0, 12932.0], [477.0, 13384.0], [476.0, 13855.0], [475.0, 13603.0], [474.0, 12458.0], [473.0, 11860.0], [472.0, 12683.0], [471.0, 13819.0], [465.0, 12443.0], [464.0, 12518.0], [467.0, 13835.0], [466.0, 12966.0], [470.0, 12284.0], [469.0, 13845.0], [468.0, 13009.0], [494.0, 14654.0], [495.0, 12547.0], [493.0, 11840.0], [492.0, 12961.0], [491.0, 13576.0], [490.0, 12512.0], [489.0, 11618.0], [488.0, 12765.0], [487.0, 12326.0], [481.0, 13408.0], [480.0, 12111.0], [483.0, 12345.0], [482.0, 11939.0], [486.0, 12239.0], [485.0, 13622.0], [484.0, 11652.0], [510.0, 6892.5], [511.0, 13006.0], [509.0, 12974.0], [508.0, 15059.0], [507.0, 12617.0], [506.0, 11498.0], [505.0, 12366.0], [504.0, 11753.0], [503.0, 11758.0], [497.0, 13183.0], [496.0, 11955.0], [499.0, 12142.0], [498.0, 12053.0], [502.0, 13505.0], [501.0, 13087.0], [500.0, 14937.0], [538.0, 11994.0], [542.0, 11345.0], [528.0, 7495.5], [529.0, 6944.0], [530.0, 12543.0], [533.0, 12156.5], [531.0, 12704.0], [535.0, 14284.0], [534.0, 12528.0], [536.0, 6618.5], [527.0, 12372.0], [513.0, 12904.0], [512.0, 11513.0], [515.0, 12437.0], [514.0, 13127.0], [517.0, 12015.0], [516.0, 13225.0], [519.0, 13269.0], [518.0, 13103.0], [526.0, 11722.0], [525.0, 13195.0], [524.0, 14260.0], [523.0, 11516.0], [522.0, 12852.0], [521.0, 12540.0], [520.0, 14432.0], [537.0, 12310.0], [543.0, 13109.0], [541.0, 11481.0], [540.0, 12496.0], [539.0, 12703.0], [572.0, 7258.5], [547.0, 8687.0], [550.0, 7288.0], [549.0, 11216.0], [548.0, 11062.0], [551.0, 11209.0], [569.0, 12743.0], [568.0, 12494.0], [553.0, 7605.5], [552.0, 13103.0], [555.0, 11762.0], [554.0, 13074.0], [557.0, 11917.0], [556.0, 12619.0], [559.0, 11635.0], [544.0, 14068.0], [546.0, 15438.0], [545.0, 12877.0], [558.0, 13279.0], [561.0, 7507.0], [560.0, 12037.0], [563.0, 12639.0], [562.0, 11513.0], [565.0, 11538.0], [564.0, 12701.0], [567.0, 11002.0], [566.0, 11786.0], [575.0, 12535.0], [574.0, 11516.0], [573.0, 12222.0], [571.0, 11251.0], [570.0, 11379.0], [604.0, 12636.0], [577.0, 6688.5], [576.0, 11223.0], [579.0, 12541.0], [578.0, 12134.0], [581.0, 11238.0], [580.0, 13755.0], [583.0, 11057.0], [582.0, 11600.0], [591.0, 11047.0], [590.0, 14431.0], [589.0, 11469.0], [588.0, 11617.0], [587.0, 11439.0], [586.0, 12380.0], [585.0, 13781.0], [584.0, 12895.0], [607.0, 11996.0], [593.0, 12570.0], [592.0, 12564.0], [595.0, 13018.0], [594.0, 11389.0], [597.0, 11922.0], [596.0, 12081.0], [599.0, 11835.0], [598.0, 13762.0], [606.0, 11541.0], [605.0, 12495.0], [603.0, 13564.0], [602.0, 12327.0], [601.0, 11870.0], [600.0, 14559.0], [636.0, 12560.0], [617.0, 6700.0], [616.0, 11891.0], [618.0, 11492.0], [620.0, 12737.0], [619.0, 12007.0], [622.0, 13440.0], [621.0, 10738.0], [623.0, 7325.5], [624.0, 6834.0], [625.0, 13464.0], [627.0, 12105.0], [626.0, 11358.0], [629.0, 11231.0], [628.0, 12651.0], [631.0, 11324.0], [630.0, 12353.0], [638.0, 12337.0], [637.0, 10877.0], [635.0, 11389.0], [634.0, 11862.0], [633.0, 11354.0], [632.0, 11304.0], [615.0, 11963.0], [614.0, 10803.0], [613.0, 13535.0], [612.0, 11703.0], [611.0, 10708.0], [610.0, 11632.5], [608.0, 10511.0], [665.0, 13038.0], [669.0, 13244.0], [650.0, 6730.5], [649.0, 11987.0], [648.0, 10435.0], [652.0, 11249.0], [651.0, 13159.0], [654.0, 11559.0], [653.0, 13631.0], [664.0, 10392.0], [647.0, 10299.0], [646.0, 10366.0], [645.0, 11549.0], [644.0, 12274.0], [643.0, 11430.0], [642.0, 10686.0], [641.0, 11679.0], [640.0, 12056.5], [655.0, 10828.0], [661.0, 6512.0], [660.0, 11994.0], [659.0, 13718.0], [658.0, 12967.0], [657.0, 11993.5], [663.0, 11369.0], [662.0, 11146.0], [671.0, 11191.0], [670.0, 9954.0], [668.0, 11891.0], [667.0, 11272.0], [666.0, 11399.0], [699.0, 7102.0], [684.0, 7091.5], [683.0, 9769.0], [682.0, 11691.0], [681.0, 10552.0], [680.0, 14067.0], [686.0, 12631.0], [685.0, 11074.0], [687.0, 7018.5], [701.0, 7378.0], [703.0, 10310.0], [695.0, 10912.0], [694.0, 11360.0], [693.0, 11126.0], [692.0, 12741.0], [691.0, 11391.0], [690.0, 11199.0], [689.0, 11547.0], [688.0, 11803.0], [702.0, 11324.0], [700.0, 13530.0], [698.0, 11959.0], [697.0, 9651.0], [696.0, 10701.0], [679.0, 10197.0], [678.0, 9971.0], [677.0, 10981.0], [676.0, 11591.0], [675.0, 10999.0], [674.0, 10662.0], [673.0, 10737.0], [672.0, 13697.0], [733.0, 12615.0], [727.0, 6802.5], [726.0, 9949.0], [725.0, 9003.0], [724.0, 11098.0], [723.0, 9781.0], [722.0, 10028.0], [721.0, 12664.0], [720.0, 13660.0], [735.0, 10590.0], [734.0, 10983.0], [732.0, 11017.0], [731.0, 12441.0], [730.0, 13070.0], [729.0, 9007.0], [728.0, 11680.0], [711.0, 10416.0], [710.0, 12959.0], [709.0, 13760.0], [708.0, 11958.0], [707.0, 11953.0], [706.0, 10205.0], [705.0, 10464.0], [704.0, 13322.0], [719.0, 10047.0], [718.0, 9637.0], [717.0, 12700.0], [716.0, 9541.0], [715.0, 10124.0], [714.0, 13989.0], [713.0, 10346.0], [712.0, 12890.0], [764.0, 10840.0], [742.0, 5340.666666666666], [738.0, 7358.5], [737.0, 10422.0], [736.0, 11007.0], [750.0, 12282.0], [749.0, 12469.0], [748.0, 11418.0], [747.0, 10548.0], [746.0, 9211.0], [745.0, 11934.0], [744.0, 10890.0], [740.0, 6515.5], [741.0, 12898.0], [739.0, 5771.0], [767.0, 9392.0], [753.0, 12722.0], [752.0, 9573.5], [755.0, 9749.0], [754.0, 9870.0], [757.0, 12754.0], [756.0, 11553.0], [759.0, 10817.0], [758.0, 12254.0], [766.0, 10811.0], [765.0, 11876.0], [763.0, 8555.0], [762.0, 9029.0], [761.0, 11351.0], [760.0, 9089.0], [743.0, 9713.0], [796.0, 9825.0], [768.0, 6656.0], [783.0, 10707.0], [782.0, 12112.0], [781.0, 10693.0], [780.0, 12384.0], [779.0, 8493.0], [778.0, 12079.0], [777.0, 11274.0], [776.0, 10754.0], [769.0, 5010.666666666666], [772.0, 4898.0], [771.0, 10751.0], [770.0, 9081.0], [774.0, 12365.0], [773.0, 10728.0], [792.0, 10564.0], [775.0, 9772.0], [799.0, 10576.0], [785.0, 11574.0], [784.0, 8694.0], [787.0, 12643.0], [786.0, 10598.0], [789.0, 11584.0], [788.0, 12238.0], [791.0, 11514.0], [790.0, 10466.0], [798.0, 11085.0], [797.0, 12430.0], [795.0, 10586.0], [793.0, 11326.0], [828.0, 12242.0], [831.0, 10791.0], [817.0, 12343.0], [816.0, 8310.0], [819.0, 10342.0], [818.0, 8419.0], [821.0, 10942.0], [820.0, 11999.0], [830.0, 8826.0], [829.0, 11984.0], [827.0, 10846.0], [826.0, 11315.0], [825.0, 10252.0], [824.0, 10280.0], [815.0, 9004.0], [801.0, 11940.0], [800.0, 12379.0], [803.0, 11629.0], [802.0, 10498.0], [805.0, 11608.0], [804.0, 12200.0], [807.0, 9002.0], [806.0, 8092.0], [814.0, 12255.0], [813.0, 11268.0], [812.0, 12199.0], [811.0, 11892.0], [810.0, 10259.5], [808.0, 11633.0], [823.0, 11262.0], [822.0, 9778.0], [860.0, 10837.0], [863.0, 10716.0], [849.0, 8305.0], [848.0, 10969.0], [851.0, 11966.0], [850.0, 8729.0], [853.0, 11831.0], [852.0, 11715.0], [862.0, 11488.0], [861.0, 11147.0], [859.0, 11073.0], [858.0, 10669.0], [857.0, 11381.0], [856.0, 10435.0], [847.0, 11176.0], [833.0, 10212.0], [832.0, 8355.0], [835.0, 12204.0], [834.0, 11888.0], [837.0, 9552.0], [836.0, 11477.0], [839.0, 11410.0], [838.0, 9889.0], [846.0, 8225.0], [845.0, 11309.0], [844.0, 9174.0], [843.0, 11174.0], [842.0, 12170.0], [841.0, 9102.0], [840.0, 7990.0], [855.0, 11401.0], [854.0, 10977.0], [892.0, 9504.0], [895.0, 11422.0], [881.0, 10801.0], [880.0, 9475.0], [883.0, 9373.0], [882.0, 9592.0], [885.0, 11008.0], [884.0, 10369.0], [894.0, 9488.0], [893.0, 9463.0], [891.0, 10775.0], [890.0, 9423.0], [889.0, 11158.0], [888.0, 11238.0], [879.0, 9641.0], [865.0, 9755.0], [864.0, 11474.0], [867.0, 10824.0], [866.0, 11447.0], [869.0, 11170.0], [868.0, 9060.0], [871.0, 8449.0], [870.0, 11083.0], [878.0, 9581.0], [877.0, 11381.0], [876.0, 10998.0], [875.0, 8387.0], [874.0, 9658.0], [873.0, 10536.0], [872.0, 10593.0], [887.0, 9562.0], [886.0, 11100.0], [924.0, 10034.0], [927.0, 10420.0], [913.0, 10933.0], [912.0, 8172.0], [915.0, 9228.0], [914.0, 10068.0], [917.0, 11067.0], [916.0, 10141.0], [926.0, 10398.0], [925.0, 10323.0], [923.0, 9151.0], [922.0, 10837.0], [921.0, 9202.0], [920.0, 9176.0], [911.0, 6864.0], [897.0, 10315.0], [896.0, 10318.0], [899.0, 11330.0], [898.0, 10931.0], [901.0, 9326.0], [900.0, 9350.0], [903.0, 10711.0], [902.0, 10228.0], [910.0, 10094.0], [909.0, 9123.0], [908.0, 10165.5], [906.0, 11068.0], [905.0, 10925.0], [904.0, 11152.0], [919.0, 9175.0], [918.0, 10838.0], [956.0, 8759.0], [959.0, 8874.0], [945.0, 10699.0], [944.0, 10254.0], [947.0, 8985.0], [946.0, 9800.0], [949.0, 10163.0], [948.0, 10231.0], [958.0, 10452.0], [957.0, 10336.0], [955.0, 9930.0], [954.0, 10878.0], [953.0, 8922.0], [952.0, 8961.0], [943.0, 10358.0], [929.0, 9046.5], [931.0, 9118.0], [930.0, 9092.0], [933.0, 9899.0], [932.0, 9073.0], [935.0, 11097.0], [934.0, 10569.0], [942.0, 10268.0], [941.0, 10974.0], [940.0, 8934.0], [939.0, 9053.0], [938.0, 9083.0], [937.0, 10128.0], [936.0, 10589.0], [951.0, 10501.0], [950.0, 10893.0], [985.0, 5473.333333333334], [990.0, 9392.0], [987.0, 4618.5], [988.0, 5430.0], [986.0, 6849.0], [991.0, 10243.0], [977.0, 8587.0], [976.0, 9679.0], [979.0, 8671.0], [978.0, 9618.0], [981.0, 9517.0], [980.0, 10374.0], [989.0, 9726.0], [984.0, 10062.0], [967.0, 8756.0], [966.0, 10052.0], [965.0, 8833.0], [964.0, 10666.0], [963.0, 9817.0], [962.0, 9838.0], [961.0, 9956.0], [960.0, 8626.0], [975.0, 8636.0], [974.0, 10228.0], [973.0, 10269.0], [972.0, 8706.0], [971.0, 9840.0], [970.0, 8630.0], [969.0, 8788.0], [968.0, 9629.0], [983.0, 10650.0], [982.0, 9583.0], [1020.0, 5457.5], [994.0, 5131.666666666667], [1004.0, 5356.0], [1003.0, 9334.0], [1002.0, 10225.0], [1001.0, 9742.0], [1000.0, 8438.0], [1005.0, 8435.0], [1007.0, 10173.0], [993.0, 10292.0], [992.0, 9494.0], [1006.0, 9506.0], [1023.0, 5839.333333333334], [1009.0, 9368.0], [1008.0, 8948.0], [1011.0, 8450.0], [1010.0, 9427.0], [1013.0, 8208.0], [1012.0, 9858.0], [1015.0, 10454.0], [1014.0, 8198.0], [1022.0, 5399.666666666667], [1021.0, 5980.0], [1019.0, 6193.0], [1018.0, 5570.142857142857], [1016.0, 10250.0], [999.0, 10408.0], [998.0, 10277.0], [997.0, 9902.0], [996.0, 9520.0], [995.0, 9008.0], [1034.0, 5756.666666666667], [1080.0, 9025.0], [1026.0, 6014.333333333334], [1028.0, 9360.0], [1030.0, 8277.0], [1024.0, 5835.0], [1054.0, 8467.5], [1052.0, 8036.0], [1050.0, 9867.0], [1048.0, 10391.0], [1046.0, 8133.0], [1044.0, 8070.0], [1042.0, 9640.0], [1040.0, 9024.0], [1036.0, 9544.0], [1038.0, 10127.0], [1072.0, 8838.333333333334], [1074.0, 8959.0], [1076.0, 9707.0], [1078.0, 8948.0], [1082.0, 9239.0], [1084.0, 9221.0], [1032.0, 5846.0], [1056.0, 8102.0], [1058.0, 9529.0], [1060.0, 9151.0], [1062.0, 9877.0], [1064.0, 10234.0], [1066.0, 8941.0], [1086.0, 9434.0], [1100.0, 9752.0], [1148.0, 7110.0], [1118.0, 6606.5], [1116.0, 7453.0], [1114.0, 8874.0], [1112.0, 9191.0], [1110.0, 9517.0], [1108.0, 8784.0], [1106.0, 8968.0], [1104.0, 9545.0], [1136.0, 7224.0], [1102.0, 7690.0], [1096.0, 7776.0], [1094.0, 7759.0], [1092.0, 7764.0], [1090.0, 7636.0], [1088.0, 7778.0], [1138.0, 8408.0], [1140.0, 7221.0], [1142.0, 8515.0], [1144.0, 7208.0], [1134.0, 7261.0], [1150.0, 6580.5], [1120.0, 7285.0], [1122.0, 9894.0], [1124.0, 9353.0], [1126.0, 9387.0], [1128.0, 8930.0], [1130.0, 8878.0], [1132.0, 7262.0], [1146.0, 9012.0], [1156.0, 7944.0], [1158.0, 8506.0], [1154.0, 8861.0], [1152.0, 7047.0], [1160.0, 8587.0], [1162.0, 6983.0], [1166.0, 6959.0], [1164.0, 7454.0], [1170.0, 5358.5], [1168.0, 8866.0], [1172.0, 6114.5], [1174.0, 8432.0], [1176.0, 8089.0], [1178.0, 8372.0], [1180.0, 8280.0], [1182.0, 8966.0], [1186.0, 4726.0], [1198.0, 7761.5], [1196.0, 6706.0], [1194.0, 7728.0], [1192.0, 7328.5], [1190.0, 8083.0], [1188.0, 6758.0], [1200.0, 5441.0], [1204.0, 5151.0], [1206.0, 6646.0], [1208.0, 6253.0], [1210.0, 5673.5], [1212.0, 5439.0], [1184.0, 7969.0], [1202.0, 5198.0], [1216.0, 5959.0], [1242.0, 5611.25], [1244.0, 6288.0], [1246.0, 6306.0], [1240.0, 7255.0], [1236.0, 6360.0], [1234.0, 8267.0], [1238.0, 5778.0], [1232.0, 5250.333333333333], [1218.0, 5194.0], [1220.0, 4909.0], [1222.0, 6498.0], [1224.0, 7630.0], [1226.0, 5067.5], [1228.0, 5002.666666666667], [1230.0, 4399.0], [1264.0, 7808.0], [1268.0, 4854.5], [1270.0, 5775.5], [1272.0, 7295.0], [1274.0, 8147.0], [1276.0, 5311.0], [1278.0, 7561.0], [1248.0, 5330.0], [1258.0, 8047.0], [1260.0, 6737.0], [1262.0, 4778.666666666667], [1256.0, 4866.0], [1254.0, 5244.5], [1252.0, 6091.0], [1250.0, 6289.0], [1288.0, 5248.5], [1282.0, 7156.0], [1280.0, 8188.0], [1308.0, 7569.0], [1310.0, 5736.0], [1302.0, 5736.0], [1304.0, 6739.0], [1306.0, 5375.5], [1300.0, 5520.5], [1298.0, 6915.0], [1296.0, 7754.0], [1284.0, 5066.0], [1292.0, 4607.0], [1294.0, 5956.5], [1290.0, 6944.0], [1314.0, 5979.0], [1316.0, 7953.0], [1312.0, 7305.0], [1336.0, 7574.0], [1334.0, 7566.0], [1338.0, 7173.0], [1340.0, 6136.5], [1342.0, 4899.666666666667], [1330.0, 7162.0], [1328.0, 6963.0], [1332.0, 4899.5], [1320.0, 4999.5], [1318.0, 5699.0], [1322.0, 7310.0], [1324.0, 6250.0], [1326.0, 7552.0], [1358.0, 4854.0], [1354.0, 5463.333333333333], [1374.0, 5808.5], [1344.0, 5168.75], [1350.0, 4960.333333333333], [1348.0, 6809.0], [1346.0, 5527.0], [1352.0, 6020.0], [1356.0, 6579.0], [1392.0, 5508.0], [1396.0, 6525.0], [1394.0, 5690.0], [1398.0, 5268.0], [1400.0, 6111.0], [1402.0, 5121.25], [1404.0, 5449.5], [1406.0, 6624.0], [1378.0, 5313.0], [1380.0, 4842.0], [1382.0, 6676.0], [1386.0, 4878.666666666667], [1388.0, 5544.5], [1390.0, 6230.0], [1384.0, 5282.333333333333], [1376.0, 4701.75], [1364.0, 5451.0], [1362.0, 6906.0], [1360.0, 7080.0], [1366.0, 6668.0], [1368.0, 7460.0], [1370.0, 6934.0], [1372.0, 4669.0], [1414.0, 6823.0], [1422.0, 4635.5], [1410.0, 4603.666666666667], [1408.0, 6567.0], [1438.0, 5316.333333333333], [1434.0, 6094.0], [1436.0, 5421.0], [1428.0, 5105.666666666667], [1426.0, 5907.0], [1430.0, 6043.0], [1432.0, 4930.4], [1412.0, 4521.0], [1416.0, 6079.0], [1418.0, 4539.666666666667], [1420.0, 6246.0], [1462.0, 5545.0], [1460.0, 6002.0], [1466.0, 6677.0], [1468.0, 5917.0], [1440.0, 7121.0], [1442.0, 6391.0], [1444.0, 5710.0], [1470.0, 6202.0], [1464.0, 4855.5], [1458.0, 5138.666666666667], [1448.0, 4861.0], [1446.0, 6123.0], [1454.0, 5724.0], [1452.0, 5791.0], [1450.0, 5915.0], [1424.0, 5298.0], [1480.0, 6588.0], [1486.0, 5642.0], [1476.0, 5460.0], [1474.0, 5521.0], [1472.0, 5350.0], [1496.0, 5248.333333333333], [1498.0, 5245.0], [1500.0, 5417.0], [1494.0, 5191.8], [1478.0, 5479.5], [1482.0, 4712.0], [1484.0, 5503.0], [1506.0, 5307.0], [1504.0, 5542.0], [1532.0, 5323.2], [1530.0, 4966.0], [1528.0, 5149.0], [1526.0, 5160.0], [1524.0, 5034.0], [1522.0, 5153.0], [1508.0, 5836.0], [1510.0, 5059.0], [1512.0, 5132.0], [1514.0, 5609.5], [1518.0, 5225.0], [1488.0, 5576.0], [1490.0, 5375.5], [1492.0, 5236.5], [1562.0, 4915.0], [1536.0, 5195.0], [1538.0, 5736.0], [1560.0, 5500.5], [1558.0, 5089.0], [1556.0, 5664.0], [1564.0, 5838.0], [1566.0, 5016.4], [1540.0, 5224.666666666667], [1542.0, 5334.0], [1544.0, 5493.0], [1546.0, 4793.5], [1570.0, 5174.0], [1572.0, 4552.0], [1574.0, 5197.0], [1576.0, 4716.0], [1568.0, 5347.8], [1550.0, 5054.0], [1548.0, 5294.0], [1554.0, 4764.0], [1552.0, 5935.0], [1033.0, 5950.0], [1025.0, 5119.25], [1027.0, 8254.0], [1029.0, 8283.0], [1055.0, 8076.0], [1051.0, 8136.0], [1049.0, 8099.0], [1047.0, 7954.0], [1045.0, 8134.0], [1043.0, 9821.0], [1041.0, 10225.0], [1035.0, 8198.0], [1037.0, 9589.0], [1039.0, 10242.0], [1073.0, 9876.0], [1075.0, 9009.0], [1077.0, 10098.0], [1079.0, 7909.0], [1081.0, 7916.0], [1083.0, 9122.0], [1085.0, 7855.0], [1031.0, 6891.5], [1087.0, 7772.0], [1057.0, 9321.0], [1059.0, 9186.0], [1061.0, 8056.0], [1063.0, 8031.0], [1065.0, 9485.0], [1069.0, 9037.0], [1067.0, 9289.0], [1099.0, 9052.0], [1139.0, 7078.0], [1117.0, 7303.0], [1115.0, 8269.0], [1113.0, 8526.0], [1111.0, 7464.0], [1109.0, 7589.0], [1107.0, 9372.0], [1105.0, 8685.0], [1103.0, 7690.0], [1101.0, 7696.0], [1097.0, 9349.0], [1095.0, 7733.0], [1093.0, 7655.0], [1091.0, 8823.0], [1089.0, 9274.0], [1119.0, 7422.0], [1137.0, 8074.0], [1141.0, 7254.0], [1143.0, 8704.0], [1133.0, 5505.5], [1135.0, 8293.0], [1145.0, 5929.5], [1149.0, 5187.0], [1151.0, 6447.5], [1121.0, 7404.0], [1123.0, 9405.0], [1125.0, 8993.0], [1127.0, 9018.0], [1129.0, 7316.0], [1131.0, 8370.0], [1147.0, 8420.0], [1157.0, 8302.0], [1203.0, 5536.333333333333], [1163.0, 4761.666666666667], [1159.0, 5860.0], [1155.0, 8353.0], [1153.0, 7061.0], [1161.0, 8408.0], [1167.0, 6448.5], [1165.0, 8889.0], [1171.0, 6214.5], [1169.0, 8599.0], [1173.0, 8860.0], [1175.0, 8745.0], [1177.0, 6864.0], [1179.0, 8291.0], [1181.0, 8733.0], [1183.0, 6869.0], [1199.0, 5945.0], [1195.0, 6717.0], [1193.0, 7682.0], [1189.0, 6610.0], [1187.0, 6818.0], [1205.0, 8674.0], [1207.0, 8458.0], [1209.0, 7529.0], [1211.0, 6580.0], [1215.0, 8513.5], [1185.0, 6806.0], [1213.0, 6561.0], [1201.0, 8215.0], [1217.0, 5810.5], [1219.0, 5344.5], [1243.0, 6325.0], [1245.0, 8324.0], [1247.0, 5633.0], [1239.0, 5297.333333333333], [1241.0, 4345.0], [1237.0, 4794.5], [1235.0, 7914.0], [1233.0, 5865.5], [1221.0, 6434.0], [1223.0, 8195.0], [1225.0, 6430.0], [1227.0, 5454.0], [1229.0, 6105.0], [1231.0, 4375.857142857143], [1267.0, 6817.5], [1265.0, 7178.0], [1269.0, 6045.0], [1271.0, 8070.0], [1273.0, 8173.0], [1275.0, 4901.0], [1277.0, 6138.5], [1279.0, 7390.0], [1257.0, 5181.0], [1259.0, 8033.0], [1261.0, 6103.5], [1263.0, 7645.0], [1255.0, 6088.5], [1253.0, 7441.0], [1251.0, 7684.0], [1249.0, 7401.0], [1287.0, 5446.0], [1295.0, 5631.0], [1283.0, 4654.5], [1281.0, 6042.0], [1307.0, 5178.5], [1309.0, 7529.0], [1311.0, 7155.0], [1303.0, 6788.0], [1305.0, 7836.0], [1301.0, 5083.0], [1299.0, 6985.0], [1297.0, 7936.0], [1285.0, 7584.0], [1293.0, 4876.0], [1291.0, 6011.0], [1289.0, 7904.0], [1315.0, 6950.0], [1343.0, 4837.666666666667], [1313.0, 6330.0], [1337.0, 5495.0], [1335.0, 7979.0], [1333.0, 7344.0], [1339.0, 5698.0], [1341.0, 5676.0], [1331.0, 4536.666666666667], [1329.0, 6846.0], [1317.0, 5106.0], [1319.0, 5725.0], [1321.0, 5574.0], [1323.0, 7733.0], [1325.0, 7141.0], [1327.0, 6085.0], [1393.0, 5007.75], [1345.0, 4556.666666666667], [1375.0, 4931.6], [1349.0, 7012.0], [1347.0, 4847.0], [1353.0, 6207.0], [1359.0, 5340.5], [1357.0, 6561.0], [1355.0, 4892.0], [1397.0, 5264.666666666667], [1395.0, 4813.0], [1399.0, 4488.5], [1403.0, 6272.0], [1407.0, 5057.0], [1405.0, 6314.0], [1401.0, 5480.5], [1377.0, 5319.666666666667], [1379.0, 6755.0], [1381.0, 4598.0], [1383.0, 5274.666666666667], [1389.0, 5743.0], [1391.0, 4407.666666666667], [1387.0, 5035.0], [1385.0, 5132.0], [1363.0, 4950.666666666667], [1361.0, 7115.0], [1367.0, 5108.0], [1365.0, 6945.0], [1369.0, 5917.0], [1371.0, 6855.0], [1373.0, 5699.0], [1413.0, 6821.0], [1409.0, 5093.0], [1439.0, 5118.0], [1437.0, 6929.0], [1433.0, 5332.666666666667], [1435.0, 4841.0], [1427.0, 6135.0], [1429.0, 6144.0], [1431.0, 6624.0], [1415.0, 5340.0], [1411.0, 6286.0], [1417.0, 6723.0], [1421.0, 5261.5], [1419.0, 5933.0], [1423.0, 5313.333333333333], [1457.0, 5558.333333333333], [1459.0, 5078.8], [1463.0, 4958.666666666666], [1461.0, 5759.0], [1465.0, 6011.5], [1467.0, 5813.0], [1469.0, 5385.0], [1471.0, 5671.0], [1441.0, 6386.0], [1443.0, 6725.0], [1445.0, 5322.5], [1447.0, 5677.0], [1449.0, 5148.0], [1455.0, 4924.0], [1453.0, 6551.0], [1451.0, 6875.0], [1425.0, 5358.5], [1479.0, 5601.0], [1481.0, 5705.0], [1475.0, 5309.5], [1473.0, 6248.0], [1495.0, 5751.0], [1497.0, 5306.0], [1499.0, 5738.0], [1501.0, 5674.0], [1503.0, 6027.5], [1493.0, 5555.333333333333], [1477.0, 5429.0], [1483.0, 5260.4], [1485.0, 5013.333333333333], [1505.0, 5588.5], [1535.0, 5104.666666666667], [1533.0, 5402.25], [1531.0, 5041.5], [1529.0, 5999.0], [1527.0, 4867.5], [1525.0, 5580.0], [1523.0, 5283.0], [1521.0, 5415.5], [1487.0, 5596.0], [1509.0, 6177.0], [1511.0, 5561.0], [1513.0, 5583.0], [1515.0, 5208.0], [1517.0, 5673.0], [1519.0, 5321.0], [1507.0, 5556.0], [1489.0, 5598.25], [1491.0, 5847.333333333333], [1563.0, 4915.0], [1545.0, 5047.0], [1537.0, 5198.666666666667], [1539.0, 6412.0], [1559.0, 5595.0], [1557.0, 5901.0], [1561.0, 4869.0], [1565.0, 4955.0], [1567.0, 5308.75], [1541.0, 5130.0], [1543.0, 5292.0], [1547.0, 5411.0], [1551.0, 4940.0], [1571.0, 4746.0], [1573.0, 4766.0], [1575.0, 5174.333333333333], [1569.0, 5389.0], [1549.0, 4963.0], [1553.0, 5758.0], [1555.0, 5339.666666666667]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[859.5420000000018, 9199.847999999994]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1576.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 12566.666666666666, "minX": 1.5495834E12, "maxY": 13998.483333333334, "series": [{"data": [[1.5495834E12, 13998.483333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5495834E12, 12566.666666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 9199.847999999994, "minX": 1.5495834E12, "maxY": 9199.847999999994, "series": [{"data": [[1.5495834E12, 9199.847999999994]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495834E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 9199.834499999992, "minX": 1.5495834E12, "maxY": 9199.834499999992, "series": [{"data": [[1.5495834E12, 9199.834499999992]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495834E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 75.30950000000007, "minX": 1.5495834E12, "maxY": 75.30950000000007, "series": [{"data": [[1.5495834E12, 75.30950000000007]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495834E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 371.0, "minX": 1.5495834E12, "maxY": 17174.0, "series": [{"data": [[1.5495834E12, 17174.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5495834E12, 371.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5495834E12, 14676.7]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5495834E12, 16521.57]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5495834E12, 15313.699999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 9175.5, "minX": 33.0, "maxY": 9175.5, "series": [{"data": [[33.0, 9175.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 9175.5, "minX": 33.0, "maxY": 9175.5, "series": [{"data": [[33.0, 9175.5]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 33.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495834E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495834E12, 33.333333333333336]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495834E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495834E12, 33.333333333333336]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5495834E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 33.333333333333336, "minX": 1.5495834E12, "maxY": 33.333333333333336, "series": [{"data": [[1.5495834E12, 33.333333333333336]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5495834E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
